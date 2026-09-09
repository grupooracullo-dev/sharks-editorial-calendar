export interface MarketingPillar {
  name: string;
  description: string;
  color: string;
  percentage: number;
}

// 6 pilares do plano de marketing da Sharks Company
export const MARKETING_PLAN_PILLARS: MarketingPillar[] = [
  { name: 'Marca & Essência', description: 'Conteúdo sobre a marca, valores e cultura', color: '#0066FF', percentage: 20 },
  { name: 'Autoridade & Educação', description: 'Conteúdo educativo e de autoridade', color: '#7C3AED', percentage: 25 },
  { name: 'Produto & Solução', description: 'Apresentação de produtos e serviços', color: '#059669', percentage: 20 },
  { name: 'Prova & Confiança', description: 'Depoimentos, cases e prova social', color: '#D97706', percentage: 15 },
  { name: 'Relacionamento & Comunidade', description: 'Engajamento e comunidade', color: '#EC4899', percentage: 10 },
  { name: 'Oferta & Conversão', description: 'Ofertas e conversão de vendas', color: '#EF4444', percentage: 10 },
];

export function marketingPillarsMissing(existing: { name: string }[]): MarketingPillar[] {
  const existingNames = new Set(existing.map(p => p.name.trim().toLowerCase()));
  return MARKETING_PLAN_PILLARS.filter(p => !existingNames.has(p.name.trim().toLowerCase()));
}