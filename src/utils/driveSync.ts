import { getApp, getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  type Auth,
  type User,
} from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';
import type { CloudSyncMetadata, Visit } from '../types/report';
import { getRecordedVisits, restoreReportEntriesFromJson, STORAGE_KEYS } from './storage';

export const GOOGLE_DRIVE_SCOPES = ['https://www.googleapis.com/auth/drive.file'] as const;
const DRIVE_FOLDER_NAME = 'BI - Relatorios Comerciais';

let firebaseApp: FirebaseApp | null = null;
let firebaseAuth: Auth | null = null;

function getFirebaseAuthInstance(): Auth | null {
  if (!firebaseConfig?.apiKey || !firebaseConfig?.projectId) {
    return null;
  }
  if (!firebaseApp) {
    firebaseApp = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
  }
  if (!firebaseAuth) {
    firebaseAuth = getAuth(firebaseApp);
  }
  return firebaseAuth;
}

const googleProvider = new GoogleAuthProvider();
GOOGLE_DRIVE_SCOPES.forEach((scope) => {
  googleProvider.addScope(scope);
});
googleProvider.setCustomParameters({
  prompt: 'select_account',
});

// OAuth access token is kept strictly in memory (never in localStorage or sessionStorage)
let inMemoryAccessToken: string | null = null;
let isSigningIn = false;

export interface GoogleAuthSnapshot {
  user: User | null;
  email: string | null;
  hasAccessToken: boolean;
  isConfigured: boolean;
}

export interface DriveReportSummary {
  id: string;
  name: string;
  modifiedTime?: string;
  webViewLink?: string;
}

export function isFirebaseOAuthConfigured(): boolean {
  return Boolean(firebaseConfig?.apiKey && firebaseConfig?.projectId);
}

export function getInMemoryAccessToken(): string | null {
  return inMemoryAccessToken;
}

export function initGoogleDriveAuth(
  onUpdate: (snapshot: GoogleAuthSnapshot) => void
): () => void {
  const auth = getFirebaseAuthInstance();
  if (!auth) {
    onUpdate({
      user: null,
      email: null,
      hasAccessToken: false,
      isConfigured: false,
    });
    return () => {};
  }

  return onAuthStateChanged(auth, (user) => {
    if (user) {
      onUpdate({
        user,
        email: user.email ?? null,
        hasAccessToken: Boolean(inMemoryAccessToken),
        isConfigured: true,
      });
    } else if (!isSigningIn) {
      inMemoryAccessToken = null;
      onUpdate({
        user: null,
        email: null,
        hasAccessToken: false,
        isConfigured: true,
      });
    }
  });
}

export async function signInWithGoogleDrive(): Promise<GoogleAuthSnapshot> {
  const auth = getFirebaseAuthInstance();
  if (!auth) {
    throw new Error('Configuração de autenticação Google indisponível neste ambiente.');
  }

  isSigningIn = true;
  try {
    const result = await signInWithPopup(auth, googleProvider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('Não foi possível obter a autorização de acesso ao Google Drive.');
    }
    inMemoryAccessToken = credential.accessToken;
    return {
      user: result.user,
      email: result.user.email ?? null,
      hasAccessToken: true,
      isConfigured: true,
    };
  } finally {
    isSigningIn = false;
  }
}

export async function signOutGoogleDrive(): Promise<void> {
  const auth = getFirebaseAuthInstance();
  inMemoryAccessToken = null;
  if (auth) {
    await auth.signOut();
  }
}

async function ensureDriveFolder(accessToken: string): Promise<string> {
  const query = `name='${DRIVE_FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
  const searchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(
    query
  )}&fields=files(id,name)&spaces=drive`;

  const searchRes = await fetch(searchUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (searchRes.status === 401) {
    inMemoryAccessToken = null;
    throw new Error('A sessão do Google Drive expirou. Volte a iniciar sessão com o Google.');
  }
  if (!searchRes.ok) {
    throw new Error('Não foi possível aceder ao Google Drive neste momento.');
  }

  const searchData = (await searchRes.json()) as { files?: Array<{ id: string; name: string }> };
  if (searchData.files && searchData.files.length > 0) {
    return searchData.files[0].id;
  }

  const createRes = await fetch('https://www.googleapis.com/drive/v3/files?fields=id,name', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: DRIVE_FOLDER_NAME,
      mimeType: 'application/vnd.google-apps.folder',
    }),
  });

  if (!createRes.ok) {
    throw new Error('Não foi possível criar a pasta no Google Drive.');
  }

  const created = (await createRes.json()) as { id: string };
  return created.id;
}

export async function checkDriveReportStatus(
  dateISO: string,
  accessToken: string
): Promise<{ folderId: string; fileName: string; existingFileId: string | null }> {
  const folderId = await ensureDriveFolder(accessToken);
  const fileName = `Relatorio_Comercial_${dateISO}.json`;
  const query = `name='${fileName}' and '${folderId}' in parents and trashed=false`;
  const searchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(
    query
  )}&fields=files(id,name,webViewLink)&spaces=drive`;

  const res = await fetch(searchUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (res.status === 401) {
    inMemoryAccessToken = null;
    throw new Error('A sessão do Google Drive expirou. Volte a iniciar sessão com o Google.');
  }
  if (!res.ok) {
    throw new Error('Falha ao verificar ficheiros existentes no Google Drive.');
  }

  const data = (await res.json()) as { files?: Array<{ id: string }> };
  return {
    folderId,
    fileName,
    existingFileId: data.files && data.files.length > 0 ? data.files[0].id : null,
  };
}

export async function listDriveReports(accessToken: string): Promise<DriveReportSummary[]> {
  const folderId = await ensureDriveFolder(accessToken);
  const query = `'${folderId}' in parents and mimeType='application/json' and trashed=false`;
  const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(
    query
  )}&orderBy=modifiedTime desc&pageSize=15&fields=files(id,name,modifiedTime,webViewLink)&spaces=drive`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (res.status === 401) {
    inMemoryAccessToken = null;
    throw new Error('A sessão do Google Drive expirou. Volte a iniciar sessão com o Google.');
  }
  if (!res.ok) {
    throw new Error('Não foi possível listar os relatórios guardados no Google Drive.');
  }

  const data = (await res.json()) as { files?: DriveReportSummary[] };
  return data.files ?? [];
}

export async function restoreDriveReportFile(
  fileId: string,
  accessToken: string
): Promise<{ restoredDates: string[]; sellerNameUpdated: boolean }> {
  const url = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (res.status === 401) {
    inMemoryAccessToken = null;
    throw new Error('A sessão do Google Drive expirou. Volte a iniciar sessão com o Google.');
  }
  if (!res.ok) {
    throw new Error('Não foi possível descarregar o relatório do Google Drive.');
  }
  const rawJson = await res.text();
  return restoreReportEntriesFromJson(rawJson);
}

export function buildStructuredReportPayload(
  dateISO: string,
  visits: Visit[],
  sellerName: string,
  googleEmail: string | null
) {
  const recorded = getRecordedVisits(visits);
  return {
    platform: 'BI · Relatório Comercial Diário (Grupo CTS)',
    date: dateISO,
    sellerName: sellerName.trim() || 'Não definido',
    googleEmail: googleEmail || null,
    exportedAt: new Date().toISOString(),
    summary: {
      totalRecorded: recorded.length,
      lockedCount: recorded.filter((v) => v.isLocked).length,
      geotaggedCount: recorded.filter(
        (v) => typeof v.latitude === 'number' && typeof v.longitude === 'number'
      ).length,
    },
    visits: recorded,
  };
}

export async function uploadReportToGoogleDrive(params: {
  dateISO: string;
  visits: Visit[];
  sellerName: string;
  email: string | null;
  accessToken: string;
  folderId: string;
  fileName: string;
  existingFileId: string | null;
}): Promise<CloudSyncMetadata> {
  const { dateISO, visits, sellerName, email, accessToken, folderId, fileName, existingFileId } =
    params;

  const payload = buildStructuredReportPayload(dateISO, visits, sellerName, email);
  const contentJson = JSON.stringify(payload, null, 2);

  const metadata: Record<string, unknown> = {
    name: fileName,
    mimeType: 'application/json',
  };
  if (!existingFileId) {
    metadata.parents = [folderId];
  }

  const boundary = `bi_rcd_${Date.now()}`;
  const multipartBody = [
    `--${boundary}`,
    'Content-Type: application/json; charset=UTF-8',
    '',
    JSON.stringify(metadata),
    `--${boundary}`,
    'Content-Type: application/json; charset=UTF-8',
    '',
    contentJson,
    `--${boundary}--`,
  ].join('\r\n');

  const url = existingFileId
    ? `https://www.googleapis.com/upload/drive/v3/files/${existingFileId}?uploadType=multipart&fields=id,name,webViewLink`
    : 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink';

  const res = await fetch(url, {
    method: existingFileId ? 'PATCH' : 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': `multipart/related; boundary=${boundary}`,
    },
    body: multipartBody,
  });

  if (res.status === 401) {
    inMemoryAccessToken = null;
    throw new Error('A sessão do Google Drive expirou. Volte a iniciar sessão com o Google.');
  }
  if (!res.ok) {
    throw new Error('Não foi possível guardar o relatório no Google Drive.');
  }

  const uploaded = (await res.json()) as { id: string; name: string; webViewLink?: string };
  const syncMeta: CloudSyncMetadata = {
    date: dateISO,
    mode: 'google_drive',
    email,
    fileName: uploaded.name || fileName,
    fileId: uploaded.id,
    webViewLink: uploaded.webViewLink,
    syncedAt: new Date().toISOString(),
    visitsCount: payload.summary.totalRecorded,
  };

  localStorage.setItem(STORAGE_KEYS.CLOUD_SYNC_PREFIX + dateISO, JSON.stringify(syncMeta));
  localStorage.removeItem(STORAGE_KEYS.CLOUD_CONTINGENCY_PREFIX + dateISO);
  return syncMeta;
}

export async function uploadExcelToGoogleDrive(params: {
  blob: Blob;
  fileName: string;
  accessToken: string;
}): Promise<{ id: string; name: string; webViewLink?: string }> {
  const { blob, fileName, accessToken } = params;
  const folderId = await ensureDriveFolder(accessToken);

  const query = `name='${fileName}' and '${folderId}' in parents and trashed=false`;
  const searchRes = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id)&spaces=drive`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (searchRes.status === 401) {
    inMemoryAccessToken = null;
    throw new Error('A sessão do Google Drive expirou. Volte a iniciar sessão com o Google.');
  }
  const searchData = searchRes.ok
    ? ((await searchRes.json()) as { files?: Array<{ id: string }> })
    : { files: [] };
  const existingId = searchData.files?.[0]?.id ?? null;

  const metadata: Record<string, unknown> = {
    name: fileName,
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  };
  if (!existingId) {
    metadata.parents = [folderId];
  }

  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
  form.append('file', blob, fileName);

  const url = existingId
    ? `https://www.googleapis.com/upload/drive/v3/files/${existingId}?uploadType=multipart&fields=id,name,webViewLink`
    : 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink';

  const res = await fetch(url, {
    method: existingId ? 'PATCH' : 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
    body: form,
  });

  if (res.status === 401) {
    inMemoryAccessToken = null;
    throw new Error('A sessão do Google Drive expirou. Volte a iniciar sessão com o Google.');
  }
  if (!res.ok) {
    throw new Error('Não foi possível enviar o Excel para o Google Drive.');
  }

  return (await res.json()) as { id: string; name: string; webViewLink?: string };
}

export function saveLocalContingencySync(params: {
  dateISO: string;
  visits: Visit[];
  sellerName: string;
  email: string | null;
}): CloudSyncMetadata {
  const { dateISO, visits, sellerName, email } = params;
  const fileName = `Relatorio_Comercial_${dateISO}.json`;
  const payload = buildStructuredReportPayload(dateISO, visits, sellerName, email);

  localStorage.setItem(
    STORAGE_KEYS.CLOUD_CONTINGENCY_PREFIX + dateISO,
    JSON.stringify(payload)
  );

  const syncMeta: CloudSyncMetadata = {
    date: dateISO,
    mode: 'local_contingency',
    email,
    fileName,
    syncedAt: new Date().toISOString(),
    visitsCount: payload.summary.totalRecorded,
  };
  localStorage.setItem(STORAGE_KEYS.CLOUD_SYNC_PREFIX + dateISO, JSON.stringify(syncMeta));
  return syncMeta;
}

export function getCloudSyncMetadata(dateISO: string): CloudSyncMetadata | null {
  const raw = localStorage.getItem(STORAGE_KEYS.CLOUD_SYNC_PREFIX + dateISO);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as CloudSyncMetadata;
  } catch {
    return null;
  }
}

export function downloadSingleReportJson(
  dateISO: string,
  visits: Visit[],
  sellerName: string,
  email: string | null
): void {
  const payload = buildStructuredReportPayload(dateISO, visits, sellerName, email);
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `Relatorio_Comercial_${dateISO}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
