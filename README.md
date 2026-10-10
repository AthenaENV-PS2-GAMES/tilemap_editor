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

- **Abrir projeto / mapa antigo…** aceita o formato original e documentos versionados.
- **Salvar projeto (com imagens)** grava um `.project.json` com todas as imagens incorporadas, permitindo abrir em outro navegador ou computador. Quando disponível, usa o seletor nativo de salvamento; caso contrário, baixa o arquivo.
- **Exportar mapa antigo** mantém o formato original quando o conteúdo é compatível. Recursos personalizados ou configurações que o formato antigo não representa exigem o formato de projeto.

O editor também salva automaticamente no IndexedDB deste navegador e recupera o projeto ao reabrir a página. Guarde uma cópia `.project.json` para transferir o trabalho.

Projetos usam `format: "tilemap-editor"` e `version: 1`. O documento inclui imagens, tilesets com recortes, tilemaps, definições e instâncias de elementos, colliders, marcadores e configuração do cenário. Seleção, câmera e imagens decodificadas pertencem à interface e não são serializadas. A importação valida dados e carrega as imagens antes de substituir o documento aberto.

Atlas em formato de lista, frames rotacionados e frames aparados (`trimmed`) ainda não são suportados. A interface informa o motivo da rejeição. IDs desconhecidos em mapas antigos permanecem salvos e aparecem com contorno amarelo.

```sh
npm test
npm run typecheck
npm run build
# Alternativa se o ambiente não suportar o processo interno do Turbopack:
npm run build -- --webpack
```

O build atual usa fontes do Google e precisa de acesso à rede na primeira compilação. O avanço e as próximas etapas estão no [ROADMAP_EDITOR.md](ROADMAP_EDITOR.md).
