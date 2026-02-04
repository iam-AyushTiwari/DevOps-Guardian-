import { create } from "zustand";

interface Incident {
  id: string;
  title: string;
  status: string;
  statusMessage?: string;
  prUrl?: string;
  timestamp: string;
  metadata?: any;
}

interface IncidentState {
  incidents: Incident[];
  setIncidents: (incidents: Incident[]) => void;
  addIncident: (incident: Incident) => void;
  updateIncident: (incident: Incident) => void;
}

export const useIncidentStore = create<IncidentState>((set) => ({
  incidents: [],
  setIncidents: (incidents) => set({ incidents }),
  addIncident: (incident) =>
    set((state) => {
      // Prevent duplicates
      if (state.incidents.find((i) => i.id === incident.id)) return state;
      return { incidents: [incident, ...state.incidents] };
    }),
  updateIncident: (incident) =>
    set((state) => ({
      incidents: state.incidents.map((i) => (i.id === incident.id ? { ...i, ...incident } : i)),
    })),
}));
