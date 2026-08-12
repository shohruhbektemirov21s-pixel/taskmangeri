/**
 * Interfeys ikonkalari - yagona uslubdagi inline SVG to'plami.
 * Barchasi currentColor bilan bo'yaladi, shuning uchun har qanday fonda ishlaydi.
 */
type P = { size?: number; className?: string };

const base = (size: number) => ({
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.9,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
});

export const IconDashboard = ({ size = 16 }: P) => (
  <svg {...base(size)}>
    <rect x="3" y="3" width="7" height="8" rx="1.5" />
    <rect x="14" y="3" width="7" height="5" rx="1.5" />
    <rect x="14" y="11" width="7" height="10" rx="1.5" />
    <rect x="3" y="14" width="7" height="7" rx="1.5" />
  </svg>
);

export const IconTasks = ({ size = 16 }: P) => (
  <svg {...base(size)}>
    <path d="M4 6.5 6 8.5 9.5 5" />
    <path d="M4 17.5 6 19.5 9.5 16" />
    <path d="M13 7h7M13 18h7" />
  </svg>
);

export const IconReview = ({ size = 16 }: P) => (
  <svg {...base(size)}>
    <circle cx="12" cy="12" r="9" />
    <path d="m8 12 2.8 2.8L16 9.5" />
  </svg>
);

export const IconHistory = ({ size = 16 }: P) => (
  <svg {...base(size)}>
    <path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1" />
    <path d="M3 4v4h4" />
    <path d="M12 7.5V12l3 1.8" />
  </svg>
);

export const IconProject = ({ size = 16 }: P) => (
  <svg {...base(size)}>
    <path d="M3 7.5A1.5 1.5 0 0 1 4.5 6h4l2 2.5h7A1.5 1.5 0 0 1 19 10v7.5A1.5 1.5 0 0 1 17.5 19h-13A1.5 1.5 0 0 1 3 17.5Z" />
  </svg>
);

export const IconWorkspace = ({ size = 16 }: P) => (
  <svg {...base(size)}>
    <rect x="3" y="4" width="8" height="16" rx="1.5" />
    <rect x="13" y="9" width="8" height="11" rx="1.5" />
    <path d="M6 8h2M6 12h2M16 13h2" />
  </svg>
);

export const IconSearch = ({ size = 16 }: P) => (
  <svg {...base(size)}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="m16 16 4.5 4.5" />
  </svg>
);

export const IconPlus = ({ size = 16 }: P) => (
  <svg {...base(size)}>
    <path d="M12 5v14M5 12h14" />
  </svg>
);

export const IconUsers = ({ size = 16 }: P) => (
  <svg {...base(size)}>
    <circle cx="9" cy="8" r="3.2" />
    <path d="M3.5 19.5a5.5 5.5 0 0 1 11 0" />
    <path d="M16 5.6a3.2 3.2 0 0 1 0 6.3M17.5 14.5a5.5 5.5 0 0 1 3 4.9" />
  </svg>
);

export const IconSettings = ({ size = 16 }: P) => (
  <svg {...base(size)}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 14.5a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1v.3a2 2 0 1 1-4 0v-.2a1.6 1.6 0 0 0-2.8-1.1l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0-1.1-2.7h-.3a2 2 0 1 1 0-4h.2a1.6 1.6 0 0 0 1.1-2.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 2.7-1.1v-.3a2 2 0 1 1 4 0v.2a1.6 1.6 0 0 0 2.8 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0 1.1 2.7h.3a2 2 0 1 1 0 4h-.2a1.6 1.6 0 0 0-1.4 1Z" />
  </svg>
);

export const IconLogout = ({ size = 16 }: P) => (
  <svg {...base(size)}>
    <path d="M9 20H5.5A1.5 1.5 0 0 1 4 18.5v-13A1.5 1.5 0 0 1 5.5 4H9" />
    <path d="M15 8.5 18.5 12 15 15.5M18.5 12H9" />
  </svg>
);

export const IconInbox = ({ size = 16 }: P) => (
  <svg {...base(size)}>
    <path d="M3 13h4l1.5 3h7L17 13h4" />
    <path d="M5.5 5h13l2.5 8v4.5A1.5 1.5 0 0 1 19.5 19h-15A1.5 1.5 0 0 1 3 17.5V13Z" />
  </svg>
);

export const IconBoard = ({ size = 16 }: P) => (
  <svg {...base(size)}>
    <rect x="3" y="4" width="5" height="16" rx="1.5" />
    <rect x="9.5" y="4" width="5" height="11" rx="1.5" />
    <rect x="16" y="4" width="5" height="7" rx="1.5" />
  </svg>
);

export const IconFile = ({ size = 16 }: P) => (
  <svg {...base(size)}>
    <path d="M14 3H7.5A1.5 1.5 0 0 0 6 4.5v15A1.5 1.5 0 0 0 7.5 21h9a1.5 1.5 0 0 0 1.5-1.5V7Z" />
    <path d="M14 3v4h4" />
  </svg>
);

export const IconShield = ({ size = 16 }: P) => (
  <svg {...base(size)}>
    <path d="M12 3 5 6v6c0 4.2 2.9 7.6 7 9 4.1-1.4 7-4.8 7-9V6Z" />
    <path d="m9 12 2.2 2.2L15 10.5" />
  </svg>
);

export const IconClock = ({ size = 16 }: P) => (
  <svg {...base(size)}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5.2l3.2 1.9" />
  </svg>
);

export const IconBook = ({ size = 16 }: P) => (
  <svg {...base(size)}>
    <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H11v16H5.5A1.5 1.5 0 0 1 4 18.5Z" />
    <path d="M20 5.5A1.5 1.5 0 0 0 18.5 4H13v16h5.5a1.5 1.5 0 0 0 1.5-1.5Z" />
  </svg>
);

export const IconLayers = ({ size = 16 }: P) => (
  <svg {...base(size)}>
    <path d="m12 3 8.5 4.5L12 12 3.5 7.5Z" />
    <path d="m4 12.5 8 4.2 8-4.2M4 16.8l8 4.2 8-4.2" />
  </svg>
);

export const IconBell = ({ size = 16 }: P) => (
  <svg {...base(size)}>
    <path d="M18 8a6 6 0 1 0-12 0c0 6-2 7-2 7h16s-2-1-2-7" />
    <path d="M13.7 20a2 2 0 0 1-3.4 0" />
  </svg>
);

export const IconChat = ({ size = 16 }: P) => (
  <svg {...base(size)}>
    <path d="M20 14a2 2 0 0 1-2 2H8l-4 4V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2z" />
  </svg>
);

export const IconSend = ({ size = 16 }: P) => (
  <svg {...base(size)}>
    <path d="M21 3 10.5 13.5" />
    <path d="M21 3l-6.5 18-4-8-8-4z" />
  </svg>
);

export const IconCheck = ({ size = 16 }: P) => (
  <svg {...base(size)}>
    <path d="M20 6 9 17l-5-5" />
  </svg>
);

export const IconClose = ({ size = 16 }: P) => (
  <svg {...base(size)}>
    <path d="M18 6 6 18M6 6l12 12" />
  </svg>
);

export const IconMail = ({ size = 16 }: P) => (
  <svg {...base(size)}>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="m3 7 9 6 9-6" />
  </svg>
);

export const IconUserPlus = ({ size = 16 }: P) => (
  <svg {...base(size)}>
    <path d="M15 20v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
    <circle cx="8.5" cy="7" r="4" />
    <path d="M19 8v6M22 11h-6" />
  </svg>
);

export const IconEye = ({ size = 16 }: P) => (
  <svg {...base(size)}>
    <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7z" />
    <circle cx="12" cy="12" r="3.2" />
  </svg>
);

export const IconEyeOff = ({ size = 16 }: P) => (
  <svg {...base(size)}>
    <path d="M10.6 6.2A9.9 9.9 0 0 1 12 6c6.4 0 10 6 10 6a17.6 17.6 0 0 1-3.2 3.9" />
    <path d="M6.6 6.8A17.4 17.4 0 0 0 2 12s3.6 7 10 7a9.7 9.7 0 0 0 4.2-.9" />
    <path d="M9.9 9.9a3.2 3.2 0 0 0 4.3 4.3" />
    <path d="M3 3l18 18" />
  </svg>
);
