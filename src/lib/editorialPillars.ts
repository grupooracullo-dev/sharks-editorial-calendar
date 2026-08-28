export interface MarketingPillar {
  name: string;
  description: string;
  color: string;
  percentage: number;
}

// 6 pilares do plano de marketing da Sharks Company
export const MARKETING_PLAN_PILLARS: MarketingPillar[] = [
  { name: 'Essência da Marca', description: 'Propósito, valores, missão e identidade da marca', color: '#0066FF', percentage: 18 },
  { name: 'Geomarketing', description: 'Conteúdo com recorte regional e presença local', color: '#059669', percentage: 16 },
  { name: 'Público Alvo e Persona', description: 'Conteúdo direcionado a personas e segmentos específicos', color: '#7C3AED', percentage: 17 },
  { name: 'Posicionamento', description: 'Como a marca se diferencia na mente do consumidor', color: '#D97706', percentage: 17 },
  { name: 'Branding', description: 'Construção e reforço contínuo da marca e percepção', color: '#EC4899', percentage: 16 },
  { name: 'Objetivo de Marketing', description: 'Conteúdo alinhado a metas e objetivos comerciais', color: '#EF4444', percentage: 16 },
];

export function marketingPillarsMissing(existing: { name: string }[]): MarketingPillar[] {
  const existingNames = new Set(existing.map(p => p.name.trim().toLowerCase()));
  return MARKETING_PLAN_PILLARS.filter(p => !existingNames.has(p.name.trim().toLowerCase()));
}