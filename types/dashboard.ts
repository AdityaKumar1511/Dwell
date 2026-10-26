export type DashboardLink = {
  id: string;
  slug: string;
  recipientName: string | null;
  recipientEmail: string | null;
  createdAt: string;
  revoked: boolean;
  expiresAt: string | null;
};

export type DashboardDocument = {
  id: string;
  title: string;
  pageCount: number;
  sizeBytes: number;
  createdAt: string;
  links: DashboardLink[];
};
