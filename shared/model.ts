export type ThemeName = 'studio' | 'midnight' | 'didactic';
export type TemplateName = 'blank' | 'course' | 'workshop' | 'demo';
export type MapOrientation = 'balanced' | 'right';

export interface MapNode {
  id: string;
  parentId: string | null;
  text: string;
  notes?: string;
  color?: string;
  image?: string;
  collapsed?: boolean;
  position?: { x: number; y: number };
}

export interface Scene { id: string; nodeId: string; title: string }

export interface MapDocument {
  schemaVersion: 1;
  id: string;
  title: string;
  theme: ThemeName;
  orientation?: MapOrientation;
  nodes: MapNode[];
  scenes: Scene[];
  revision: number;
  createdAt: string;
  updatedAt: string;
  favorite?: boolean;
  folder?: string;
}

const id = () => crypto.randomUUID();
const colors = ['#356AD8', '#8054C8', '#D96746', '#268875', '#C58A32', '#C35F88'];

export function createMap(template: TemplateName = 'blank', title?: string): MapDocument {
  const now = new Date().toISOString();
  const rootId = id();
  const defaultTitles = { blank: 'Uma nova ideia', course: 'Minha próxima aula', workshop: 'Treinamento da equipe', demo: 'A arte de aprender' };
  const nodes: MapNode[] = [{ id: rootId, parentId: null, text: title || defaultTitles[template] }];
  const scenes: Scene[] = [];
  const appendBranch = (text: string, children: string[], index: number, notes?: string) => {
    const branchId = id();
    nodes.push({ id: branchId, parentId: rootId, text, color: colors[index % colors.length], notes });
    children.forEach(text => nodes.push({ id: id(), parentId: branchId, text }));
    scenes.push({ id: id(), nodeId: branchId, title: text });
    return branchId;
  };
  if (template === 'demo') {
    appendBranch('Comece com curiosidade', ['Faça boas perguntas', 'Conecte ao que você já sabe', 'Explore novos caminhos', 'Dê espaço à descoberta'], 0, 'Abra a conversa com uma pergunta que mobilize a turma. Convide cada pessoa a trazer uma experiência.');
    appendBranch('Organize as ideias', ['Encontre a ideia central', 'Agrupe por significado', 'Use palavras essenciais', 'Desenhe conexões'], 1, 'Este mapa é editável: dê um duplo clique em qualquer tópico. Tab cria um filho; Enter cria um irmão.');
    appendBranch('Aprenda fazendo', ['Experimente na prática', 'Crie um pequeno projeto', 'Aprenda com os erros', 'Compartilhe o processo'], 2);
    appendBranch('Crie conexões', ['Conte uma boa história', 'Use exemplos do cotidiano', 'Combine texto e imagem', 'Converse com outras pessoas'], 3);
    appendBranch('Ensine para aprender', ['Explique com suas palavras', 'Revele um assunto por vez', 'Convide a turma a participar', 'Faça uma revisão visual'], 4);
    appendBranch('Transforme em ação', ['Escolha um próximo passo', 'Defina uma pequena meta', 'Revise o que funcionou', 'Celebre o progresso'], 5);
    const practice = nodes.find(n => n.text === 'Crie um pequeno projeto');
    if (practice) nodes.push({ id: id(), parentId: practice.id, text: 'O conhecimento ganha vida quando é aplicado.' });
  } else if (template === 'course') {
    appendBranch('Objetivos de aprendizagem', ['O que vamos aprender?', 'Por que isso importa?'], 0);
    appendBranch('Explore o conteúdo', ['Conceito principal', 'Exemplo prático', 'Conexões importantes'], 1);
    appendBranch('Hora de praticar', ['Atividade em grupo', 'Discussão e descobertas'], 2);
    appendBranch('Consolide o aprendizado', ['Ideias essenciais', 'Perguntas e próximos passos'], 3);
  } else if (template === 'workshop') {
    appendBranch('Abertura', ['Boas-vindas', 'Expectativas da equipe'], 0);
    appendBranch('Desenvolvimento', ['Desafio central', 'Ferramentas e técnicas', 'Demonstração'], 1);
    appendBranch('Prática guiada', ['Dinâmica em equipes', 'Compartilhamento'], 2);
    appendBranch('Plano de ação', ['Compromissos', 'Próximos passos'], 3);
  }
  return { schemaVersion: 1, id: id(), title: title || defaultTitles[template], theme: 'studio', orientation: 'balanced', nodes, scenes, revision: 0, createdAt: now, updatedAt: now, favorite: template === 'demo', folder: '' };
}

const validId = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(value);
const string = (value: unknown, max: number) => typeof value === 'string' && value.length <= max;

/** Validates untrusted content and returns a clean, serializable document. */
export function validateMap(input: unknown): MapDocument {
  if (!input || typeof input !== 'object') throw new Error('Documento de mapa inválido.');
  const m = input as Record<string, unknown>;
  if (m.schemaVersion !== 1 || !validId(m.id) || !string(m.title, 300) || !(m.title as string).trim()) throw new Error('Título, identificador ou versão do mapa inválidos.');
  if (!['studio', 'midnight', 'didactic'].includes(String(m.theme))) throw new Error('Tema inválido.');
  if (m.orientation !== undefined && m.orientation !== 'balanced' && m.orientation !== 'right') throw new Error('Orientação inválida.');
  if (!Array.isArray(m.nodes) || m.nodes.length < 1 || m.nodes.length > 5000) throw new Error('O mapa deve conter de 1 a 5.000 tópicos.');
  if (!Array.isArray(m.scenes) || m.scenes.length > 1000) throw new Error('Sequência de apresentação inválida.');
  if (!Number.isSafeInteger(m.revision) || Number(m.revision) < 0) throw new Error('Revisão inválida.');
  if (!string(m.createdAt, 40) || !string(m.updatedAt, 40) || !Number.isFinite(Date.parse(String(m.createdAt))) || !Number.isFinite(Date.parse(String(m.updatedAt)))) throw new Error('Datas inválidas.');
  if (m.favorite !== undefined && typeof m.favorite !== 'boolean') throw new Error('Favorito inválido.');
  if (m.folder !== undefined && !string(m.folder, 100)) throw new Error('Pasta inválida.');
  const ids = new Set<string>();
  const nodes: MapNode[] = m.nodes.map(raw => {
    if (!raw || typeof raw !== 'object') throw new Error('Tópico inválido.');
    const n = raw as Record<string, unknown>;
    if (!validId(n.id) || ids.has(n.id) || (n.parentId !== null && !validId(n.parentId)) || !string(n.text, 3000)) throw new Error('Identificador, pai ou texto de tópico inválido.');
    ids.add(n.id);
    if (n.notes !== undefined && !string(n.notes, 20000)) throw new Error('Nota muito longa.');
    if (n.color !== undefined && !(typeof n.color === 'string' && /^#[0-9a-f]{6}$/i.test(n.color))) throw new Error('Cor inválida.');
    if (n.image !== undefined && !(typeof n.image === 'string' && /^[a-f0-9]{64}\.(png|jpg|webp)$/.test(n.image))) throw new Error('Imagem inválida.');
    if (n.collapsed !== undefined && typeof n.collapsed !== 'boolean') throw new Error('Estado de ramo inválido.');
    const p = n.position as Record<string, unknown> | undefined;
    if (p && (typeof p !== 'object' || !Number.isFinite(p.x) || !Number.isFinite(p.y) || Math.abs(Number(p.x)) > 1000000 || Math.abs(Number(p.y)) > 1000000)) throw new Error('Posição inválida.');
    return { id: n.id, parentId: n.parentId as string | null, text: n.text as string, ...(n.notes !== undefined ? { notes: n.notes as string } : {}), ...(n.color ? { color: n.color as string } : {}), ...(n.image ? { image: n.image as string } : {}), ...(n.collapsed !== undefined ? { collapsed: n.collapsed as boolean } : {}), ...(p ? { position: { x: Number(p.x), y: Number(p.y) } } : {}) };
  });
  if (nodes.filter(n => n.parentId === null).length !== 1) throw new Error('O mapa deve ter exatamente um tópico central.');
  const byId = new Map(nodes.map(n => [n.id, n]));
  for (const node of nodes) {
    const visited = new Set<string>();
    let current: MapNode | undefined = node;
    while (current) {
      if (visited.has(current.id)) throw new Error('Não é possível criar ciclos entre tópicos.');
      visited.add(current.id);
      if (visited.size > 128) throw new Error('O mapa aceita até 128 níveis de tópicos. Organize parte do conteúdo em um novo ramo.');
      if (current.parentId === null) break;
      current = byId.get(current.parentId);
      if (!current) throw new Error('Um tópico referencia um pai inexistente.');
    }
  }
  const sceneIds = new Set<string>();
  const scenes: Scene[] = m.scenes.map(raw => {
    if (!raw || typeof raw !== 'object') throw new Error('Cena inválida.');
    const scene = raw as Record<string, unknown>;
    if (!validId(scene.id) || sceneIds.has(scene.id) || typeof scene.nodeId !== 'string' || !ids.has(scene.nodeId) || !string(scene.title, 3000)) throw new Error('Cena referencia tópico inexistente ou possui dados inválidos.');
    sceneIds.add(scene.id);
    return { id: scene.id, nodeId: scene.nodeId, title: scene.title as string };
  });
  return { schemaVersion: 1, id: m.id as string, title: m.title as string, theme: m.theme as ThemeName, ...(m.orientation !== undefined ? { orientation: m.orientation as MapOrientation } : {}), nodes, scenes, revision: Number(m.revision), createdAt: m.createdAt as string, updatedAt: m.updatedAt as string, ...(m.favorite !== undefined ? { favorite: m.favorite as boolean } : {}), ...(m.folder !== undefined ? { folder: m.folder as string } : {}) };
}
