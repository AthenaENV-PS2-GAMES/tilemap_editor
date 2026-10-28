# TileMap Editor

Editor 2D em Next.js e Canvas, com catálogo de tilesets e elementos.

```sh
npm install
npm run dev
```

Na aba **Mosaico / TileMap**, clique em **Importar tileset…**, carregue uma imagem e configure largura, altura, margem e espaçamento. Também é possível carregar um atlas JSON com `frames` em objeto. A prévia mostra os recortes; clique em um deles para pintar. Vários tilesets podem coexistir, e cada recorte mantém seu tamanho visual, independentemente da grade do tilemap.

No painel **Tilemaps**, crie, renomeie, selecione e oculte mapas. Cada um possui camada, tamanho de célula e origem próprios. Alterar a grade de um mapa ocupado mostra uma prévia e pede uma escolha para as posições existentes.

A aba **Elementos** oferece os objetos, inimigos e player originais e permite criar elementos de uma imagem ou de um recorte de tileset. Elementos podem se sobrepor, usar posição livre e ser arrastados em grupo. O alinhamento de objetos e o de marcadores/colliders são configurados separadamente. Colliders, marcadores, propriedades e desfazer/refazer continuam disponíveis.

Em **Arquivo**:

- **Abrir projeto…** aceita apenas arquivos `.project.json` na versão 2. Mapas e projetos de versões antigas são recusados. Depois de abrir, o mapa aparece com contornos amarelos nos tiles até as imagens serem anexadas.
- **Salvar projeto (sem imagens)** grava um `.project.json` só com índices de tiles e posições: nenhuma imagem e nenhum recorte entram no arquivo. Quando disponível, usa o seletor nativo de salvamento; caso contrário, baixa o arquivo.
- **Anexar imagens e atlas…** (abre sozinho depois de abrir um projeto) pede, para cada tileset ou elemento, a mesma imagem usada ao salvar e, nos tilesets em modo atlas, o atlas JSON. O editor confere as dimensões da imagem e o número de recortes do atlas; tilesets em grade só precisam da imagem. Anexar não entra no histórico de desfazer.

O editor não traz atlas, tilesets ou elementos embutidos: o projeto começa vazio e tudo vem de **Importar tileset…** e **Criar elemento…**. Ele também salva automaticamente no IndexedDB deste navegador (com as imagens) e recupera o projeto ao reabrir a página; isso não vai para o `.project.json`.

Projetos usam `format: "tilemap-editor"` e `version: 2`. O arquivo contém metadados de imagens (nome e dimensões), tilesets (modo, grade e número de recortes), definições de elementos, tilemaps, colliders, marcadores e cenário. Cada tile é `{ tileset, index, x, y, order, layer?, locked?, creationCode? }`, onde `index` é a posição do recorte na grade ou na ordem dos `frames` do atlas; elementos usam `element` no lugar de `tileset`/`index`. Seleção, câmera e imagens decodificadas pertencem à interface e não são serializadas.

Atlas em formato de lista, frames rotacionados e frames aparados (`trimmed`) ainda não são suportados. A interface informa o motivo da rejeição.

```sh
npm test
npm run typecheck
npm run build
# Alternativa se o ambiente não suportar o processo interno do Turbopack:
npm run build -- --webpack
```

O build atual usa fontes do Google e precisa de acesso à rede na primeira compilação. O avanço e as próximas etapas estão no [ROADMAP_EDITOR.md](ROADMAP_EDITOR.md).
