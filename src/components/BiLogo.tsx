interface BiLogoProps {
  className?: string;
}

export function BiLogo({ className = 'w-full h-full' }: BiLogoProps) {
  return (
    <svg
      viewBox="0 0 110 64"
      className={className}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <rect x="58" y="34" width="6" height="16" rx="2" fill="#7DD3FC" />
      <rect x="67" y="26" width="6" height="24" rx="2" fill="#38BDF8" />
      <rect x="76" y="18" width="6" height="32" rx="2" fill="#0284C7" />
      <rect x="85" y="10" width="6" height="40" rx="2" fill="#192863" />
      <path
        d="M56 28L70 17L79 21L91 8"
        stroke="#0084C7"
        strokeWidth="2.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M85 8H91V14"
        stroke="#0084C7"
        strokeWidth="2.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <text
        x="12"
        y="46"
        fontFamily="Plus Jakarta Sans, sans-serif"
        fontWeight="800"
        fontSize="34"
        fill="#192863"
      >
        BI
      </text>
    </svg>
  );
}
