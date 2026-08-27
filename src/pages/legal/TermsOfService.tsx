import LegalLayout, { Section } from './LegalLayout';

export default function TermsOfService() {
  return (
    <LegalLayout title="Termos de Serviço" updated="26 de agosto de 2026">
      <p className="text-sm leading-relaxed text-gray-600 bg-primary-50 border border-primary-100 rounded-xl p-4">
        Estes Termos regem o uso da plataforma <strong>Oracullo Calendar</strong>, operada pelo
        <strong> Grupo Oracullo</strong>, incluindo os ambientes Sharks Company (marketing editorial) e
        Estrategos (gestão de projetos). Ao criar conta e utilizar o serviço, você concorda com estas condições.
      </p>

      <Section n={1} title="Descrição do serviço">
        <p>O Oracullo Calendar é uma plataforma de gestão de calendário editorial e de projetos que permite planejar ações, organizar clientes em workspaces e, de forma opcional, sincronizar as ações planejadas com o Google Calendar dos usuários autorizados.</p>
      </Section>

      <Section n={2} title="Contas e acessos">
        <p>O acesso é concedido mediante aprovação do administrador do respectivo ambiente. Cada usuário é responsável pela guarda das suas credenciais e por toda atividade realizada na sua conta.</p>
        <p>O acesso entre ambientes (Sharks Company, Estrategos e governança Oracullo) é controlado individualmente; a vinculação a workspaces de clientes é definida pelos administradores.</p>
      </Section>

      <Section n={3} title="Uso aceitável">
        <p>É vedado utilizar a plataforma para fins ilícitos, tentar acessar workspaces sem autorização, interferir na disponibilidade do serviço ou burlar controles de acesso. Contas que violem estas regras poderão ser suspensas ou encerradas.</p>
      </Section>

      <Section n={4} title="Integração Google Calendar">
        <p>A sincronização é opcional e depende do seu consentimento via OAuth do Google. Ao conectar, eventos das ações planejadas são criados, atualizados ou removidos na agenda selecionada, conforme o cronograma da plataforma.</p>
        <p>Você é responsável pelas contas Google que conecta. A desconexão interrompe novas sincronizações; eventos já criados permanecem na sua agenda até que você os remova.</p>
      </Section>

      <Section n={5} title="Propriedade intelectual">
        <p>A plataforma, sua marca, layout e código são propriedade do Grupo Oracullo. Os conteúdos (ações, campanhas, projetos e mensagens) pertencem aos respectivos autores e clientes, permanecendo isolados por ambiente e workspace.</p>
      </Section>

      <Section n={6} title="Disponibilidade e limitação de responsabilidade">
        <p>Buscamos alta disponibilidade, mas não garantimos serviço ininterrupto, estando sujeito a manutenções e eventos de terceiros (incluindo indisponibilidades das APIs do Google ou dos provedores de nuvem).</p>
        <p>Na máxima extensão permitida pela lei, o Grupo Oracullo não responde por danos indiretos decorrentes do uso do serviço, perda de dados de terceiros ou falhas na sincronização causadas por limitações externas.</p>
      </Section>

      <Section n={7} title="Rescisão">
        <p>Você pode encerrar o uso a qualquer momento solicitando a desativação da conta. O Grupo Oracullo pode encerrar acessos em caso de violação destes Termos, com comunicação prévia quando possível.</p>
      </Section>

      <Section n={8} title="Alterações e contato">
        <p>Estes Termos podem ser atualizados; a data no topo indica a última revisão. Dúvidas: <a href="mailto:grupo.oracullo@gmail.com" className="text-primary-600 hover:underline">grupo.oracullo@gmail.com</a>.</p>
      </Section>
    </LegalLayout>
  );
}
