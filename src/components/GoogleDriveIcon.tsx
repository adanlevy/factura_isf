import React from 'react';

interface GoogleDriveIconProps {
  className?: string;
}

export function GoogleDriveIcon({ className = 'w-4 h-4' }: GoogleDriveIconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 87.3 78"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="Google Drive"
    >
      <path
        d="M6.6 66.85l3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8H0c0 1.55.4 3.1 1.2 4.5l5.4 9.35z"
        fill="#0066DA"
      />
      <path
        d="M43.65 25L29.9 1.2c-1.35.8-2.5 1.9-3.3 3.3l-25.4 44C.4 49.9 0 51.45 0 53h27.5L43.65 25z"
        fill="#00AC47"
      />
      <path
        d="M73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5H59.8l5.85 10.15 7.9 13.65z"
        fill="#EA4335"
      />
      <path
        d="M43.65 25L57.4 1.2C56.05.4 54.5 0 52.9 0H34.4c-1.6 0-3.15.4-4.5 1.2L43.65 25z"
        fill="#00832D"
      />
      <path
        d="M59.8 53H27.5L13.75 76.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.4 4.5-1.2L59.8 53z"
        fill="#2684FC"
      />
      <path
        d="M73.4 26.5l-12.7-22C59.35 1.9 58.2.8 56.85 0L43.65 25l16.15 28h27.5c0-1.55-.4-3.1-1.2-4.5l-12.7-22z"
        fill="#FFBA00"
      />
    </svg>
  );
}

export function GoogleDriveLinkButton({
  url,
  driveUrl,
  driveFolder,
  title = "Abrir carpeta en Google Drive",
  className = "",
  size = "md",
  label,
  iconOnly = false,
}: {
  url?: string;
  driveUrl?: string;
  driveFolder?: string;
  title?: string;
  className?: string;
  size?: "xs" | "sm" | "md" | "lg";
  label?: string;
  iconOnly?: boolean;
}) {
  const finalUrl =
    url ||
    driveUrl ||
    (driveFolder ? `https://drive.google.com/drive/search?q=${encodeURIComponent(driveFolder)}` : '');

  if (!finalUrl) return null;

  const sizeClasses = {
    xs: iconOnly ? "p-0.5 rounded hover:bg-slate-100" : "px-1.5 py-0.5 rounded text-[9.5px]",
    sm: iconOnly ? "p-1 rounded-md hover:bg-slate-100" : "px-2 py-1 rounded-md text-[10px]",
    md: iconOnly ? "p-1.5 rounded-lg hover:bg-slate-100" : "px-2.5 py-1.5 rounded-lg text-xs",
    lg: iconOnly ? "p-2 rounded-xl hover:bg-slate-100" : "px-3 py-2 rounded-xl text-xs",
  };

  const iconSizes = {
    xs: "w-3 h-3",
    sm: "w-3.5 h-3.5",
    md: "w-4 h-4",
    lg: "w-4.5 h-4.5",
  };

  const extSizes = {
    xs: "w-2 h-2",
    sm: "w-2.5 h-2.5",
    md: "w-3 h-3",
    lg: "w-3.5 h-3.5",
  };

  if (iconOnly) {
    return (
      <a
        href={finalUrl}
        target="_blank"
        rel="noopener noreferrer"
        className={`inline-flex items-center justify-center text-slate-500 hover:text-slate-900 transition active:scale-95 shrink-0 opacity-85 hover:opacity-100 ${sizeClasses[size] || sizeClasses.xs} ${className}`}
        title={title}
      >
        <GoogleDriveIcon className={iconSizes[size] || iconSizes.xs} />
      </a>
    );
  }

  return (
    <a
      href={finalUrl}
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex items-center space-x-1.5 bg-slate-100/90 hover:bg-slate-200 text-slate-700 hover:text-slate-900 border border-slate-200 shadow-2xs font-semibold transition active:scale-95 shrink-0 ${sizeClasses[size] || sizeClasses.md} ${className}`}
      title={title}
    >
      <GoogleDriveIcon className={iconSizes[size] || iconSizes.md} />
      {label && <span>{label}</span>}
      <svg
        className={`${extSizes[size] || extSizes.md} text-slate-400 group-hover:text-slate-700`}
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        viewBox="0 0 24 24"
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
        <polyline points="15 3 21 3 21 9" />
        <line x1="10" y1="14" x2="21" y2="3" />
      </svg>
    </a>
  );
}
