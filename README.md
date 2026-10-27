# DrawMapping

Estúdio de mapas mentais para criar, organizar e apresentar aulas. Executa no navegador, com servidor e dados no próprio computador.

## Instalar no Windows

Instale o Node.js **24.11.1 ou superior** (inclui npm) e o Git. Em seguida, execute:

```powershell
git clone https://github.com/nvsolucoes/drawmapping.git
cd drawmapping
npm install
```

O `npm install` prepara o aplicativo e cria o atalho **DrawMapping** na área de trabalho do Windows. Dê dois cliques nele para abrir o servidor local em um terminal minimizado e abrir o navegador. Mantenha o terminal aberto enquanto você usa o aplicativo; ele pode ser restaurado pela barra de tarefas. Mantenha a pasta do projeto no mesmo lugar, pois o atalho aponta para ela. Se o atalho não for criado automaticamente, execute `node scripts/cli.mjs atalho`; você também pode iniciar por `npm start` e parar por `node scripts/cli.mjs parar`.

Para não criar o atalho automaticamente, defina `DRAWMAPPING_NO_SHORTCUT=1` antes de instalar. A instalação e atualização precisam de internet; o uso diário é local. O pacote ainda não foi publicado no npm. Um pacote `.tgz` preparado com `npm pack` também pode ser instalado globalmente com `npm install -g caminho-do-pacote.tgz`; nesse caso os comandos `drawmapping`, `drawmapping atalho` e `drawmapping parar` ficam disponíveis.

## Abrir a partir da pasta de desenvolvimento

Dê duplo clique em **`Iniciar DrawMapping.bat`** na pasta do projeto. O navegador abre automaticamente. Mantenha a janela do servidor aberta durante o uso; pressione **Ctrl+C** nela para encerrar.

Você também pode usar **`Parar DrawMapping.bat`** depois de confirmar **Salvo no computador** na interface. Ele encerra somente a instância identificada do DrawMapping, sem afetar outros programas Node.

O endereço padrão é `http://127.0.0.1:4587`. Se a porta estiver ocupada, o servidor usa outra disponível e informa o endereço. Abrir o BAT novamente reutiliza a instância existente.

Requisitos: Windows, Chrome ou Edge e Node.js **24.11.1 ou superior**. Em um checkout novo, instale as dependências com `npm install`; a interface é compilada na preparação. `Preparar DrawMapping.bat` também permite preparar ou reconstruir o aplicativo. A abertura diária não executa npm e não baixa pacotes.

## Criar e apresentar

1. Na biblioteca, abra o mapa demonstrativo ou crie um mapa em branco, uma aula ou um treinamento.
   Para organizar por assunto, use **+** em **Suas pastas**. Clique na pasta para ver seus mapas ou criar um novo dentro dela. Para mover um mapa existente, abra suas opções e escolha **Nome e pasta**. Pastas vazias também ficam guardadas e entram no backup.
   Use os botões ao lado da ordenação para alternar entre blocos e lista; a escolha fica salva no navegador.
2. Selecione um tópico. Use **Tab** para criar um filho, **Enter** para criar um irmão e **F2** ou duplo clique para editar. Os campos de texto mantêm seu comportamento normal.
   Para mudar a conexão, arraste um tópico sobre outro: o destino fica destacado e a linha mostra a nova ligação. Solte para confirmar. Os subtópicos acompanham o ramo; soltar em área vazia apenas o reposiciona. Ao clicar em **Organizar mapa**, a ordem vertical atual entre tópicos do mesmo ramo é mantida. Use **Desfazer** para reverter.
3. Use o painel de propriedades para cores, notas, imagens e organização dos ramos. **Desfazer** e **Refazer** recuperam alterações da sessão.
   Em **Estilo → Orientação do mapa**, escolha **Automática** para distribuir os ramos nos dois lados ou **À direita** para organizá-los no mesmo lado. Trocar a orientação reorganiza posições manuais; use **Desfazer** para recuperá-las. A opção fica salva por mapa.
4. Aguarde **Salvo** antes de fechar a aba. O indicador distingue alterações pendentes, gravação em andamento e falhas.
5. Em **Apresentar**, escolha **Apresentação livre** para abrir ou recolher ramos clicando nos tópicos, na ordem que quiser, sem os controles do editor. Use o mouse para navegar e a roda para aproximar; **Esc** sai. Em **Com roteiro**, percorra as etapas com as setas ou Page Up/Page Down; **Home** retorna à visão geral. As notas não aparecem na audiência.
   Nas duas apresentações, o espaço é calculado a partir dos tópicos visíveis e se ajusta quando um ramo é revelado. A disposição usada na apresentação não modifica as posições salvas no editor.
6. Exporte uma cópia editável **`.drawmap`** para transportar o mapa com suas imagens. PNG e SVG servem para materiais visuais; PDF usa o diálogo **Salvar como PDF** do navegador.

### Animações com presença

No editor, use **Animar mapa** para reproduzir a construção dos ramos e tópicos em sequência. Ao abrir ou fechar um ramo, os demais tópicos se reorganizam suavemente com suas conexões. As animações são padrão e a preferência de movimento reduzido do sistema é respeitada. Trocar de tema também tem transições; durante a aula, a câmera acompanha o conteúdo.

Após atualizar, confirme que os mapas estão salvos, encerre o servidor com `drawmapping parar` ou `Parar DrawMapping.bat` e abra novamente para carregar também o servidor atualizado. Os mapas permanecem na biblioteca.

## Onde os mapas ficam

Por padrão: `%LOCALAPPDATA%\DrawMapping`.

O banco `library.sqlite`, suas imagens e backups ficam separados desta pasta de código. Limpar os dados do navegador não apaga a biblioteca. Apagar a pasta de dados do DrawMapping remove a biblioteca; guarde backups em outro dispositivo se quiser proteção contra falha do computador.

Use **Backups** na aplicação para criar, baixar e restaurar uma cópia completa. Restaurar preserva uma cópia da biblioteca anterior. A lixeira permite recuperar mapas removidos. O histórico registra checkpoints limitados; não é um histórico ilimitado de cada tecla.

Não copie apenas `library.sqlite` enquanto o servidor está aberto: o SQLite também usa arquivos de transação. Prefira o backup gerado pela aplicação.

## Offline e limites

Fontes, ícones, interface e imagens importadas ficam locais. Criar, editar, apresentar, salvar e exportar não dependem de APIs externas. O servidor escuta somente em `127.0.0.1`; a aplicação não é publicada e não aceita acesso de outros computadores por padrão.

Imagens aceitas: PNG, JPEG e WebP, até 8 MB, 8.192 px por lado e 40 megapixels. O formato aceita até 5.000 tópicos e 128 níveis; mapas grandes podem exigir recolhimento de ramos e exportação SVG em vez de PNG. A impressão de um mapa extenso em uma única página reduz o texto; para aula, use o foco em ramos.

Arquivos `.drawmap`: até 64 MB compactados/128 MB expandidos. Backups completos: até 256 MB, incluindo imagens e histórico, e dois milhões de tópicos agregados. Ao exceder esses limites, a aplicação informa o problema antes de confirmar a criação; divida o material ou exporte mapas separadamente.

Node `24.11.1` inclui SQLite embutido e pode exibir um aviso `ExperimentalWarning` no terminal. O banco usa transações e não precisa de servidor de banco nem addon nativo. O aviso não significa que o salvamento falhou; consulte o indicador da interface.

## Desenvolvimento e verificação

```powershell
npm.cmd ci
npm.cmd run build
npm.cmd start
```

```powershell
npm.cmd run lint
npm.cmd run typecheck
npm.cmd test
```

Para desenvolver a interface: iniciar a API com `npm.cmd run serve` e, em outro terminal, `npm.cmd run dev`.

Configuração opcional por variáveis de ambiente: `DRAWMAPPING_DATA_DIR` para uma biblioteca alternativa em disco local e `DRAWMAPPING_PORT` para a porta preferida. `DRAWMAPPING_NO_OPEN=1` inicia sem abrir o navegador. No uso normal não é necessário configurar nada.

## Licença

O código do DrawMapping é disponibilizado sob a [licença MIT](LICENSE). As licenças dos componentes de terceiros estão em [public/third-party-licenses.txt](public/third-party-licenses.txt).
