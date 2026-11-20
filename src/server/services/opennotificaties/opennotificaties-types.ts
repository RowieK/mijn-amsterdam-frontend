// Alleen de velden van de Open Notificaties API (1.0.0) die de BFF gebruikt.

export type KanaalSource = {
  url: string;
  naam: string;
  documentatieLink: string;
  filters: string[];
};

export type AbonnementSource = {
  url: string;
  callbackUrl: string; // het endpoint van de abonnee, bijvoorbeeld de OMC
  kanalen: { naam: string; filters?: Record<string, string> }[];
};
