import { useState } from 'react';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { useEditorial } from '@/hooks/useEditorial';
import Card, { CardHeader, CardTitle } from '@/components/ui/Card';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import EmptyState from '@/components/ui/EmptyState';
import StrategicDatesSection from '@/components/editorial/StrategicDatesSection';
import FormatFrequencyStepper from '@/components/editorial/FormatFrequencyStepper';
import type { FormatFrequency } from '@/types';
import { DAYS_OF_WEEK } from '@/lib/constants';
import { toast } from 'sonner';
import { BookOpen, Target, Clock, Ban, Plus, Trash2 } from 'lucide-react';

export default function SharksEditorial() {
  const { currentWorkspace } = useWorkspace();
  const { pillars, profile, updateProfile, createPillar, deletePillar } = useEditorial(currentWorkspace?.id);
  const [newPillarName, setNewPillarName] = useState('');
  const [audienceDraft, setAudienceDraft] = useState<string | null>(null);
  const [restrictionsDraft, setRestrictionsDraft] = useState<string | null>(null);

  if (!currentWorkspace) {
    return (
      <Card>
        <EmptyState icon={BookOpen} title="Selecione um cliente" description="Use o seletor no topo para escolher um workspace." />
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Linha Editorial</h1>
        <p className="text-sm text-gray-500 mt-0.5">Perfil editorial de {currentWorkspace.name}</p>
      </div>

      {/* Profile Settings */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="w-4 h-4 text-primary-500" />
              Frequência e Dias
            </CardTitle>
          </CardHeader>
          {profile && (
            <div className="space-y-4">
              <FormatFrequencyStepper
                value={(profile.format_frequency ?? {}) as FormatFrequency}
                onChange={(ff) => updateProfile({ format_frequency: ff })}
              />
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Dias permitidos</label>
                <div className="flex flex-wrap gap-1.5">
                  {DAYS_OF_WEEK.map(day => {
                    const allowed = profile.allowed_days.includes(day.value);
                    return (
                      <button
                        key={day.value}
                        onClick={() => {
                          const newDays = allowed
                            ? profile.allowed_days.filter(d => d !== day.value)
                            : [...profile.allowed_days, day.value].sort();
                          updateProfile({ allowed_days: newDays });
                        }}
                        className={`px-3 py-1.5 text-xs rounded-lg transition-colors ${
                          allowed ? 'bg-primary-100 text-primary-700' : 'bg-gray-100 text-gray-400 hover:bg-gray-200'
                        }`}
                      >
                        {day.short}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-primary-500" />
              Público e Restrições
            </CardTitle>
          </CardHeader>
          {profile && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Público-alvo</label>
                <textarea
                  value={audienceDraft ?? profile.target_audience ?? ''}
                  onChange={(e) => setAudienceDraft(e.target.value)}
                  onBlur={() => {
                    if (audienceDraft !== null && audienceDraft !== (profile.target_audience || '')) {
                      updateProfile({ target_audience: audienceDraft || null });
                      toast.success('Perfil atualizado');
                    }
                    setAudienceDraft(null);
                  }}
                  rows={3}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                  placeholder="Descreva o público prioritário..."
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5 flex items-center gap-1.5">
                  <Ban className="w-3.5 h-3.5" /> Restrições
                </label>
                <textarea
                  value={restrictionsDraft ?? profile.restrictions ?? ''}
                  onChange={(e) => setRestrictionsDraft(e.target.value)}
                  onBlur={() => {
                    if (restrictionsDraft !== null && restrictionsDraft !== (profile.restrictions || '')) {
                      updateProfile({ restrictions: restrictionsDraft || null });
                      toast.success('Perfil atualizado');
                    }
                    setRestrictionsDraft(null);
                  }}
                  rows={2}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                  placeholder="Ex: Não publicar ofertas aos domingos"
                />
              </div>
            </div>
          )}
        </Card>
      </div>

      {/* Strategic Dates */}
      <StrategicDatesSection workspaceId={currentWorkspace.id} />

      {/* Pillars */}
      <Card>
        <CardHeader>
          <CardTitle>Pilares Editoriais</CardTitle>
          <span className="text-xs text-gray-400">{pillars.length} pilares</span>
        </CardHeader>

        <div className="space-y-2">
          {pillars.map(p => (
            <div key={p.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg group">
              <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: p.color }} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900">{p.name}</p>
              </div>
              <Badge variant="primary">{p.percentage}%</Badge>
              <button
                onClick={() => deletePillar(p.id)}
                className="opacity-0 group-hover:opacity-100 p-1.5 text-gray-300 hover:text-red-500 transition-all"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>

        <div className="flex gap-2 mt-4 pt-4 border-t border-gray-100">
          <input
            value={newPillarName}
            onChange={(e) => setNewPillarName(e.target.value)}
            placeholder="Nome do novo pilar..."
            className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500/20"
          />
          <Button
            variant="outline"
            disabled={!newPillarName.trim() || !currentWorkspace}
            onClick={() => {
              if (newPillarName.trim()) {
                createPillar({
                  workspace_id: currentWorkspace.id,
                  name: newPillarName.trim(),
                  percentage: 10,
                  color: '#0066FF',
                });
                setNewPillarName('');
              }
            }}
          >
            <Plus className="w-4 h-4" />
            Adicionar
          </Button>
        </div>
      </Card>
    </div>
  );
}
