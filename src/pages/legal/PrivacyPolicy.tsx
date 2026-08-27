import LegalLayout, { Section } from './LegalLayout';

export default function PrivacyPolicy() {
  return (
    <LegalLayout title="Política de Privacidade" updated="26 de agosto de 2026">
      <p className="text-sm leading-relaxed text-gray-600 bg-primary-50 border border-primary-100 rounded-xl p-4">
        Esta Política explica como o <strong>Grupo Oracullo</strong> ("nós") trata os dados pessoais dos
        usuários da plataforma <strong>Oracullo Calendar</strong>, incluindo os ambientes Sharks Company e
        Estrategos, em conformidade com a Lei nº 13.709/2018 (LGPD).
      </p>

      <Section n={1} title="Dados que coletamos">
        <p><strong>a) Dados de cadastro:</strong> nome, e-mail e senha (criptografada), fornecidos no momento da solicitação de acesso ou do login com Google.</p>
        <p><strong>b) Dados de uso:</strong> informações das ações de calendário criadas na plataforma (títulos, datas, descrições, status), campanhas, projetos e mensagens de chat associados aos workspaces aos quais você tem acesso.</p>
        <p><strong>c) Dados de integração (opcionais):</strong> se você conectar o Google Calendar, com o seu consentimento expresso, processamos o e-mail da sua conta Google, os identificadores das agendas selecionadas e os tokens de acesso emitidos pelo Google, estritamente para sincronizar as ações planejadas.</p>
      </Section>

      <Section n={2} title="Finalidade e base legal">
        <p>Os dados são tratados para: (i) autenticar usuários e controlar acesses por ambiente; (ii) executar o serviço de gestão e sincronização de calendário editorial; (iii) comunicar alterações operacionais do serviço.</p>
        <p>Bases legais: execução de contrato (uso da plataforma), consentimento (integração Google Calendar) e legítimo interesse (segurança e prevenção a abusos).</p>
      </Section>

      <Section n={3} title="Integração com Google Calendar">
        <p>A sincronização utiliza as APIs oficiais do Google e respeita os <a href="https://policies.google.com/terms" target="_blank" rel="noreferrer" className="text-primary-600 hover:underline">Termos de Serviço do Google</a> e a <a href="https://policies.google.com/privacy" target="_blank" rel="noreferrer" className="text-primary-600 hover:underline">Política de Privacidade do Google</a>.</p>
        <p>Solicitamos apenas os escopos necessários: criação e edição de eventos, leitura de agendas que o próprio app criou, leitura da lista de agendas e e-mail da conta. O uso de dados via APIs do Google adere ao <strong>Google API Services User Data Policy</strong>, incluindo os requisitos de <strong>Limited Use</strong>.</p>
        <p>Você pode revogar o consentimento a qualquer momento desconectando a integração na página "Integrações" ou em <a href="https://myaccount.google.com/permissions" target="_blank" rel="noreferrer" className="text-primary-600 hover:underline">myaccount.google.com/permissions</a>.</p>
      </Section>

      <Section n={4} title="Compartilhamento">
        <p>Não vendemos nem alugamos dados pessoais. Compartilhamos somente o necessário: infraestrutura de hospedagem (Vercel e Supabase) e, quando você autoriza, o Google para a sincronização de calendário.</p>
      </Section>

      <Section n={5} title="Retenção e segurança">
        <p>Mantemos os dados enquanto a conta estiver ativa ou enquanto necessário para as finalidades descritas. Tokens do Google são armazenados criptografados em trânsito e em repouso pelo provedor, com acesso restrito por políticas de segurança em nível de linha (RLS) — cada usuário acessa exclusivamente dados dos workspaces aos quais está vinculado.</p>
      </Section>

      <Section n={6} title="Seus direitos (LGPD)">
        <p>Você pode solicitar confirmação de tratamento, acesso, correção, anonimização, portabilidade ou eliminação de dados, além de revogar consentimentos, pelo e-mail <a href="mailto:grupo.oracullo@gmail.com" className="text-primary-600 hover:underline">grupo.oracullo@gmail.com</a>.</p>
      </Section>

      <Section n={7} title="Alterações desta política">
        <p>Podemos atualizar esta política para refletir mudanças legais ou no serviço. A data no topo da página indica a última revisão; alterações relevantes serão comunicadas dentro da plataforma.</p>
      </Section>
    </LegalLayout>
  );
}
