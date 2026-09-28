/**
 * Mock data used by the API layer during development.
 * Delete this file and remove its imports once the real backend is wired up.
 */

import type { Document, Connection, SystemStatus } from '../types'

export const MOCK_DOCUMENTS: Document[] = [
  {
    id: 'doc-1',
    name: 'Q3 Financial Report',
    size: '2.4 MB',
    pages: 48,
    chunks: 312,
    status: 'indexed',
    color: '#e4e4e7',
    topics: ['revenue', 'EBITDA', 'supply chain', 'forecast'],
    excerpts: [
      'Consolidated revenue for Q3 reached $412M, up 14% year over year, led by enterprise renewals and APAC expansion.',
      'Gross margin compressed 210 basis points to 61.4%, driven by Tier-2 vendor delays and expedited freight.',
      'Adjusted EBITDA of $96M beat guidance by $7M; management raised full-year guidance to $1.52–1.56B.',
      'Supply chain disruption added an estimated $18M of unplanned cost — the largest single driver of the margin decline.',
    ],
    uploadedAt: '2026-08-01T10:00:00Z',
  },
  {
    id: 'doc-2',
    name: 'Market Analysis APAC',
    size: '5.1 MB',
    pages: 92,
    chunks: 608,
    status: 'indexed',
    color: '#c7c7cd',
    topics: ['market share', 'competitors', 'growth', 'APAC'],
    excerpts: [
      'APAC now represents 31% of global revenue, growing 18% year over year — the fastest of any region.',
      'Market share in the enterprise segment rose to 24.6%, overtaking the incumbent for the first time.',
      'Competitor discounting in the mid-market reached 12%, pressuring gross margin across the category.',
      'Logistics bottlenecks in Southeast Asia are industry-wide and continue to raise landed cost.',
    ],
    uploadedAt: '2026-08-03T14:30:00Z',
  },
  {
    id: 'doc-3',
    name: 'Supply Chain Risk Assessment',
    size: '1.8 MB',
    pages: 34,
    chunks: 218,
    status: 'indexed',
    color: '#a1a1aa',
    topics: ['logistics', 'risk', 'vendor', 'disruption'],
    excerpts: [
      'The Tier-2 vendor cluster in Vietnam is rated high risk (8.4/10) due to single-source dependency and seasonal flooding.',
      'A sustained disruption at these vendors would affect an estimated 23% of finished goods production.',
      'Unmitigated, the vendor delays carry a margin impact of up to 250 basis points over the next two quarters.',
      'Mitigation: dual-sourcing to Malaysia and holding 6 weeks of buffer inventory, at an estimated cost of $9M.',
    ],
    uploadedAt: '2026-08-05T09:15:00Z',
  },
  {
    id: 'doc-4',
    name: 'Board Memo — Aug 2026',
    size: '0.6 MB',
    pages: 12,
    chunks: 84,
    status: 'processing',
    color: '#8a8a93',
    topics: ['strategy', 'M&A', 'guidance'],
    excerpts: [
      'The board approved exploring a Vietnam manufacturing partnership to de-risk the Tier-2 vendor cluster.',
      'Management expects gross margin to recover to 63% by Q2 as supply chain mitigation lands.',
      '2027 guidance is reiterated; supply chain resilience is flagged as the top strategic priority.',
      'M&A valuation models reference Q3 Financial Report figures for the base-case DCF.',
    ],
    uploadedAt: '2026-08-10T16:00:00Z',
  },
  {
    id: 'doc-5',
    name: 'Competitor Intelligence v2',
    size: '3.2 MB',
    pages: 61,
    chunks: 0,
    status: 'queued',
    color: '#71717a',
    topics: [],
    uploadedAt: '2026-08-12T11:45:00Z',
  },
]

export const MOCK_CONNECTIONS: Connection[] = [
  {
    from: 'doc-1',
    to: 'doc-2',
    strength: 0.87,
    type: 'semantic',
    snippet:
      'APAC revenue contribution increased 18% YoY, consistent with regional market expansion documented in the Market Analysis.',
  },
  {
    from: 'doc-1',
    to: 'doc-3',
    strength: 0.79,
    type: 'entity',
    snippet:
      'Vendor Tier-2 disruptions in the Risk Assessment directly map to Q3 gross margin compression of 210bps.',
  },
  {
    from: 'doc-2',
    to: 'doc-3',
    strength: 0.64,
    type: 'semantic',
    snippet:
      'Logistics bottlenecks in Southeast Asia appear in both the Market Analysis competitive section and the Risk Assessment.',
  },
  {
    from: 'doc-1',
    to: 'doc-4',
    strength: 0.91,
    type: 'citation',
    snippet:
      'The Board Memo directly references Q3 Financial Report figures for the M&A valuation model and 2027 guidance.',
  },
  {
    from: 'doc-3',
    to: 'doc-4',
    strength: 0.55,
    type: 'temporal',
    snippet:
      'Risk Assessment mitigation timeline aligns with strategic initiatives in the August Board Memo.',
  },
]

export const MOCK_STATUS: SystemStatus = {
  vectorDbOnline: true,
  totalDocs: MOCK_DOCUMENTS.filter((d) => d.status === 'indexed').length,
  totalChunks: MOCK_DOCUMENTS.reduce((sum, d) => sum + d.chunks, 0),
}
