import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type PersonaId =
  | 'Vendor'
  | 'PIC'
  | 'SIC'
  | 'DPM'
  | 'DDVM'
  | 'DVM'
  | 'ModelCoordinator'
  | 'SectionAdmin'
  | 'Admin'

export interface PersonaMeta {
  id: PersonaId
  label: string
  /** Tailwind CSS custom-property colour name (e.g. 'persona-vendor') */
  colorKey: string
  /** Hex fallback for non-Tailwind contexts */
  hex: string
}

export const PERSONAS: PersonaMeta[] = [
  { id: 'Vendor',           label: 'Vendor',            colorKey: 'persona-vendor', hex: '#f97316' },
  { id: 'PIC',              label: 'PIC',               colorKey: 'persona-pic',    hex: '#c4b5fd' },
  { id: 'SIC',              label: 'SIC',               colorKey: 'persona-sic',    hex: '#a78bfa' },
  { id: 'DPM',              label: 'DPM',               colorKey: 'persona-dpm',    hex: '#6366f1' },
  { id: 'DDVM',             label: 'DDVM',              colorKey: 'persona-ddvm',   hex: '#8b5cf6' },
  { id: 'DVM',              label: 'Division Manager',  colorKey: 'persona-dvm',    hex: '#7c3aed' },
  { id: 'ModelCoordinator', label: 'Model Coordinator', colorKey: 'persona-mc',     hex: '#0891b2' },
  { id: 'SectionAdmin',     label: 'Department Co-ordinator', colorKey: 'persona-sa', hex: '#d97706' },
  { id: 'Admin',            label: 'Super Admin',       colorKey: 'persona-admin',  hex: '#10b981' },
]

/** Role-only identity: fixed section / vendor per persona (no named users). */
export const FIXED_SECTION = 'NP1'
export const FIXED_VENDOR_NAME = 'Minda Industries'

export interface PersonaScope {
  /** Restrict to parts in this Section.id */
  section?: string
  /** Restrict to parts whose vendorName matches */
  vendor?: string
}

/** PIC, SIC and SectionAdmin are fixed to section NP1; Vendor to Minda; other roles are unrestricted ({}). */
export function getPersonaScope(persona: PersonaId): PersonaScope {
  if (persona === 'PIC' || persona === 'SIC' || persona === 'SectionAdmin') return { section: FIXED_SECTION }
  if (persona === 'Vendor') return { vendor: FIXED_VENDOR_NAME }
  return {}
}

interface PersonaState {
  currentPersona: PersonaId
  setPersona: (id: PersonaId) => void
}

export const usePersonaStore = create<PersonaState>()(
  persist(
    (set) => ({
      currentPersona: 'PIC',
      setPersona: (id) => set({ currentPersona: id }),
    }),
    {
      name: 'qa-tracker-persona',
    },
  ),
)
