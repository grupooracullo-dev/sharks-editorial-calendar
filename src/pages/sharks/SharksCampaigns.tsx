import { useState } from 'react';
import { useCampaigns } from '@/hooks/useCampaigns';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import Card from '@/components/ui/Card';
import Modal from '@/components/ui/Modal';
import Input from '@/components/ui/Input';
import Textarea from '@/components/ui/Textarea';
import Select from '@/components/ui/Select';
import Button from '@/components/ui/Button';
import EmptyState from '@/components/ui/EmptyState';
import { toast } from 'sonner';
import Badge from '@/components/ui/Badge';
import { formatDate } from '@/lib/utils';
import { PRIORITIES } from '@/lib/constants';
import { Plus, Megaphone, Calendar, Users } from 'lucide-react';

export default function SharksCampaigns() {
  const { currentWorkspace } = useWorkspace();
  const { campaigns, createCampaign } = useCampaigns(currentWorkspace?.id);
  const [modalOpen, setModalOpen] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    objective: '',
    start_date: '',
    end_date: '',
    description: '',
    audience: '',
    product: '',
    priority: 'medium',
  });

  const handleCreate = async () => {
    if (!currentWorkspace || !formData.name.trim()) return;
    const result = await createCampaign({
      ...formData,
      workspace_id: currentWorkspace.id,
      status: 'active',
    });
    if (result.ok) {
      toast.success('Campanha criada!');
    } else {
      toast.error(result.error || 'Erro ao criar campanha');
      return;
    }
    setFormData({ name: '', objective: '', start_date: '', end_date: '', description: '', audience: '', product: '', priority: 'medium' });
    setModalOpen(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Campanhas</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {currentWorkspace ? `Campanhas de ${currentWorkspace.name}` : 'Selecione um cliente para ver as campanhas'}
          </p>
        </div>
        {currentWorkspace && (
          <Button onClick={() => setModalOpen(true)}>
            <Plus className="w-4 h-4" />
            Nova campanha
          </Button>
        )}
      </div>

      {!currentWorkspace ? (
        <Card>
          <EmptyState icon={Megaphone} title="Selecione um cliente" description="Use o seletor no topo para escolher um workspace." />
        </Card>
      ) : campaigns.length === 0 ? (
        <Card>
          <EmptyState
            icon={Megaphone}
            title="Nenhuma campanha"
            description="Crie campanhas para agrupar ações do calendário."
            action={<Button onClick={() => setModalOpen(true)}>+ Nova campanha</Button>}
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {campaigns.map(c => {
            const isActive = c.status === 'active';
            return (
              <Card key={c.id}>
                <div className="flex items-start justify-between mb-3">
                  <div className="w-10 h-10 bg-primary-50 rounded-lg flex items-center justify-center">
                    <Megaphone className="w-5 h-5 text-primary-600" />
                  </div>
                  <Badge variant={isActive ? 'success' : 'default'}>
                    {isActive ? 'Ativa' : 'Rascunho'}
                  </Badge>
                </div>
                <h3 className="font-semibold text-gray-900 mb-1">{c.name}</h3>
                {c.objective && <p className="text-sm text-gray-500 mb-2">{c.objective}</p>}
                <div className="flex items-center gap-4 text-xs text-gray-400">
                  {c.start_date && (
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {formatDate(c.start_date)} — {c.end_date ? formatDate(c.end_date) : '?'}
                    </span>
                  )}
                  {c.audience && (
                    <span className="flex items-center gap-1">
                      <Users className="w-3 h-3" />
                      {c.audience}
                    </span>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Create Modal */}
      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title="Nova Campanha" size="lg">
        <div className="space-y-4">
          <Input label="Nome *" value={formData.name} onChange={(e) => setFormData(p => ({ ...p, name: e.target.value }))} placeholder="Ex: Campanha Dia dos Pais" />
          <Input label="Objetivo" value={formData.objective} onChange={(e) => setFormData(p => ({ ...p, objective: e.target.value }))} placeholder="Ex: Aumentar vendas" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input label="Início" type="date" value={formData.start_date} onChange={(e) => setFormData(p => ({ ...p, start_date: e.target.value }))} />
            <Input label="Fim" type="date" value={formData.end_date} onChange={(e) => setFormData(p => ({ ...p, end_date: e.target.value }))} />
          </div>
          <Textarea label="Descrição" value={formData.description} onChange={(e) => setFormData(p => ({ ...p, description: e.target.value }))} />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input label="Público" value={formData.audience} onChange={(e) => setFormData(p => ({ ...p, audience: e.target.value }))} />
            <Input label="Produto" value={formData.product} onChange={(e) => setFormData(p => ({ ...p, product: e.target.value }))} />
          </div>
          <Select
            label="Prioridade"
            value={formData.priority}
            onChange={(e) => setFormData(p => ({ ...p, priority: e.target.value }))}
            options={PRIORITIES.map(p => ({ value: p.value, label: p.label }))}
          />
        </div>
        <div className="flex justify-end gap-2 mt-6 pt-4 border-t border-gray-100">
          <Button variant="ghost" onClick={() => setModalOpen(false)}>Cancelar</Button>
          <Button onClick={handleCreate} disabled={!formData.name.trim()}>Criar campanha</Button>
        </div>
      </Modal>
    </div>
  );
}
