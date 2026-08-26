import { ContentFormat, FormatFrequencyZone, Objective, ActionType, ActionStatus, FunnelStage, UserRole, DateRelevance, NotificationType, SyncStatus } from '@/types';

// ==========================================
// SHARKS EDITORIAL CALENDAR - CONSTANTS
// ==========================================

export const APP_NAME = 'Oracullo Calendar';
export const COMPANY_NAME = 'Oracullo';

// User Roles
export const USER_ROLES: Record<UserRole, string> = {
  oracullo_admin: 'Administrador Oracullo',
  admin_sharks: 'Admin Sharks',
  sharks_team: 'Equipe Sharks',
  client: 'Cliente',
};

// Action Statuses
export const ACTION_STATUSES: Record<ActionStatus, { label: string; color: string; bgColor: string }> = {
  draft: { label: 'Rascunho', color: 'text-gray-500', bgColor: 'bg-gray-100' },
  briefing: { label: 'Briefing', color: 'text-blue-500', bgColor: 'bg-blue-50' },
  in_production: { label: 'Em Produção', color: 'text-yellow-600', bgColor: 'bg-yellow-50' },
  sharks_review: { label: 'Revisão Sharks', color: 'text-purple-600', bgColor: 'bg-purple-50' },
  scheduled: { label: 'Programado', color: 'text-indigo-600', bgColor: 'bg-indigo-50' },
  published: { label: 'Publicado', color: 'text-green-600', bgColor: 'bg-green-50' },
  completed: { label: 'Concluído', color: 'text-emerald-600', bgColor: 'bg-emerald-50' },
  cancelled: { label: 'Cancelado', color: 'text-red-500', bgColor: 'bg-red-50' },
  overdue: { label: 'Atrasado', color: 'text-orange-600', bgColor: 'bg-orange-50' },
};

// Action Types
export const ACTION_TYPES: Record<ActionType, string> = {
  content: 'Conteúdo',
  campaign: 'Campanha',
  production: 'Produção',
  recording: 'Gravação',
  photo_session: 'Sessão Fotográfica',
  approval: 'Aprovação',
  publication: 'Publicação',
  ad: 'Anúncio',
  crm: 'CRM',
  whatsapp: 'WhatsApp',
  email: 'E-mail',
  event: 'Evento',
  meeting: 'Reunião',
  strategic_date: 'Data Estratégica',
  commercial: 'Comercial',
  other: 'Outro',
};

// Content Formats
export const CONTENT_FORMATS: Record<ContentFormat, string> = {
  reels: 'Reels',
  story: 'Story',
  story_sequence: 'Sequência de Stories',
  carousel: 'Carrossel',
  static_post: 'Post Estático',
  photo: 'Foto',
  video: 'Vídeo',
  live: 'Live',
  whatsapp: 'WhatsApp',
  whatsapp_status: 'Status WhatsApp',
  email_marketing: 'E-mail Marketing',
  newsletter: 'Newsletter',
  landing_page: 'Landing Page',
  blog: 'Blog',
  youtube: 'YouTube',
  ad: 'Anúncio',
  commercial_material: 'Material Comercial',
  other: 'Outro',
};

// Zonas de visualização → formatos do enum do banco
export const FORMAT_ZONES: Record<FormatFrequencyZone, ContentFormat[]> = {
  feed: ['static_post', 'carousel', 'photo', 'video'],
  story: ['story', 'story_sequence'],
  reels: ['reels'],
};

// Objectives
export const OBJECTIVES: Record<Objective, string> = {
  brand_awareness: 'Reconhecimento de Marca',
  positioning: 'Posicionamento',
  authority: 'Autoridade',
  educational: 'Educacional',
  engagement: 'Engajamento',
  relationship: 'Relacionamento',
  traffic: 'Tráfego',
  lead_conversion: 'Conversão de Lead',
  sale_conversion: 'Conversão de Venda',
  social_proof: 'Prova Social',
  launch: 'Lançamento',
  loyalty: 'Fidelização',
  repurchase: 'Recompra',
  retention: 'Retenção',
  reactivation: 'Reativação',
};

// Funnel Stages
export const FUNNEL_STAGES: Record<FunnelStage, string> = {
  discovery: 'Descoberta',
  interest: 'Interesse',
  consideration: 'Consideração',
  conversion: 'Conversão',
  relationship: 'Relacionamento',
  repurchase: 'Recompra',
};

// Days of Week
export const DAYS_OF_WEEK = [
  { value: 0, label: 'Domingo', short: 'Dom' },
  { value: 1, label: 'Segunda-feira', short: 'Seg' },
  { value: 2, label: 'Terça-feira', short: 'Ter' },
  { value: 3, label: 'Quarta-feira', short: 'Qua' },
  { value: 4, label: 'Quinta-feira', short: 'Qui' },
  { value: 5, label: 'Sexta-feira', short: 'Sex' },
  { value: 6, label: 'Sábado', short: 'Sáb' },
];

// Default Editorial Pillars
export const DEFAULT_PILLARS = [
  { name: 'Marca & Essência', percentage: 15 },
  { name: 'Autoridade & Educação', percentage: 25 },
  { name: 'Produto & Solução', percentage: 20 },
  { name: 'Prova & Confiança', percentage: 15 },
  { name: 'Relacionamento & Comunidade', percentage: 10 },
  { name: 'Oferta & Conversão', percentage: 15 },
];

// Date Relevance
export const DATE_RELEVANCE: Record<DateRelevance, { label: string; color: string }> = {
  high: { label: 'Alta', color: 'text-red-500 bg-red-50' },
  medium: { label: 'Média', color: 'text-yellow-600 bg-yellow-50' },
  low: { label: 'Baixa', color: 'text-gray-500 bg-gray-50' },
};

// Notification Types
export const NOTIFICATION_TYPES: Record<NotificationType, { label: string; icon: string }> = {
  message: { label: 'Nova Mensagem', icon: 'message-circle' },
  suggestion: { label: 'Nova Sugestão', icon: 'lightbulb' },
  calendar_generated: { label: 'Calendário Gerado', icon: 'calendar' },
  action_upcoming: { label: 'Ação Próxima', icon: 'clock' },
  action_overdue: { label: 'Ação Atrasada', icon: 'alert-circle' },
  campaign_starting: { label: 'Campanha Iniciando', icon: 'megaphone' },
  sync_error: { label: 'Erro de Sincronização', icon: 'alert-triangle' },
  calendar_undefined: { label: 'Calendário Não Definido', icon: 'calendar-x' },
};

// Sync Status
export const SYNC_STATUS: Record<SyncStatus, { label: string; color: string }> = {
  not_synced: { label: 'Não sincronizado', color: 'text-gray-400' },
  synced: { label: 'Sincronizado', color: 'text-green-500' },
  modified_after_sync: { label: 'Alterado após sync', color: 'text-yellow-500' },
  sync_error: { label: 'Erro de sync', color: 'text-red-500' },
};

// Format Colors (for calendar events)
export const FORMAT_COLORS: Record<ContentFormat, string> = {
  reels: 'bg-purple-100 text-purple-700 border-purple-200',
  story: 'bg-pink-100 text-pink-700 border-pink-200',
  story_sequence: 'bg-pink-100 text-pink-700 border-pink-200',
  carousel: 'bg-blue-100 text-blue-700 border-blue-200',
  static_post: 'bg-sky-100 text-sky-700 border-sky-200',
  photo: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  video: 'bg-red-100 text-red-700 border-red-200',
  live: 'bg-orange-100 text-orange-700 border-orange-200',
  whatsapp: 'bg-green-100 text-green-700 border-green-200',
  whatsapp_status: 'bg-green-100 text-green-700 border-green-200',
  email_marketing: 'bg-amber-100 text-amber-700 border-amber-200',
  newsletter: 'bg-amber-100 text-amber-700 border-amber-200',
  landing_page: 'bg-cyan-100 text-cyan-700 border-cyan-200',
  blog: 'bg-indigo-100 text-indigo-700 border-indigo-200',
  youtube: 'bg-red-100 text-red-700 border-red-200',
  ad: 'bg-yellow-100 text-yellow-700 border-yellow-200',
  commercial_material: 'bg-gray-100 text-gray-700 border-gray-200',
  other: 'bg-gray-100 text-gray-700 border-gray-200',
};

// Format Icons
export const FORMAT_ICONS: Record<ContentFormat, string> = {
  reels: 'play',
  story: 'circle',
  story_sequence: 'layers',
  carousel: 'images',
  static_post: 'image',
  photo: 'camera',
  video: 'video',
  live: 'radio',
  whatsapp: 'message-circle',
  whatsapp_status: 'message-circle',
  email_marketing: 'mail',
  newsletter: 'mail',
  landing_page: 'globe',
  blog: 'file-text',
  youtube: 'youtube',
  ad: 'megaphone',
  commercial_material: 'briefcase',
  other: 'more-horizontal',
};

// Default channels
export const DEFAULT_CHANNELS = [
  { name: 'Instagram', icon: 'instagram' },
  { name: 'Facebook', icon: 'facebook' },
  { name: 'TikTok', icon: 'music' },
  { name: 'WhatsApp', icon: 'message-circle' },
  { name: 'YouTube', icon: 'youtube' },
  { name: 'LinkedIn', icon: 'linkedin' },
  { name: 'E-mail', icon: 'mail' },
  { name: 'Blog', icon: 'file-text' },
];

// Segment options
export const SEGMENTS = [
  'Alimentação',
  'Restaurante',
  'Serviços',
  'Varejo',
  'Saúde',
  'Educação',
  'Tecnologia',
  'Imobiliário',
  'Automotivo',
  'Beleza',
  'Fitness',
  'B2B',
  'Outro',
];

// Priority levels
export const PRIORITIES = [
  { value: 'low', label: 'Baixa' },
  { value: 'medium', label: 'Média' },
  { value: 'high', label: 'Alta' },
  { value: 'urgent', label: 'Urgente' },
];
