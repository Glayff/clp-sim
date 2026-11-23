# CLP Sim

Simulador didático de CLP com editor Ladder, para Windows. React + Vite + TypeScript, empacotado como aplicativo desktop com Electron.

À esquerda fica o **painel de campo** (botoeiras, chave seletora, sinaleiros, motor). No centro, a **folha de diagrama** com o Ladder, onde cada fio fica verde quando passa energia.

## Gerar o executável (.exe)

Requisito: [Node.js](https://nodejs.org) 20 ou mais novo, instalado no Windows.

```bash
npm install          # uma vez só (baixa o Electron, leva alguns minutos)
npm run dev          # abre no navegador em http://localhost:5173 (bom para desenvolver)
npm start            # compila e abre como aplicativo desktop
npm run dist:win     # gera os executáveis na pasta release/
```

Em `release/` ficam dois arquivos:

- `CLP Sim <versão>.exe`: versão portátil, roda sem instalar.
- `CLP Sim Setup <versão>.exe`: instalador.

O Windows pode mostrar o aviso do SmartScreen, porque o app não tem assinatura digital. Clique em "Mais informações" e depois em "Executar assim mesmo".

## Como usar

- **Rodar / Pausar / Passo / Parar**: Pausar congela o programa mantendo a memória; Passo executa exatamente uma varredura (ótimo para ver a energia andar degrau por degrau); Parar desliga as saídas e zera a memória, menos o que for marcado como retentivo.
- **Ciclo**: tempo de varredura (5 a 250 ms). Aumente para ver, na prática, como o tempo de ciclo afeta pulsos curtos e temporizadores.
- **Entradas**: cada uma pode ser chave seletora, botão NA ou botão NF (o seletor fica embaixo do nome). Botão NF dá nível 1 em repouso e 0 quando pressionado, como na botoeira de DESLIGA de uma partida.
- **Entradas analógicas**: AI0 a AI3 têm um controle deslizante de 0 a 100 %. O painel mostra o sinal equivalente em mA (4–20) e o valor bruto que o programa lê (0 a 27648, como nos módulos analógicos de campo). AQ0 e AQ1 são as saídas analógicas.
- **Inserir**: escolha uma instrução na barra superior e clique em um **+** do degrau. A instrução inserida já fica selecionada para você trocar endereço, tipo e valores na coluna da direita.
- **Selo / OU**: selecione um contato e use **Em paralelo**. Depois insira outro contato no ramo de baixo.
- **Nomes**: digite o nome nas plaquetas do painel de campo, ou no inspetor para M, D, T e C. Os nomes aparecem no diagrama.
- **Exemplos**: onze programas prontos, do selo de partida ao controle de nível com sensor analógico.
- **Atalhos**: `Ctrl+Z` desfaz, `Ctrl+Y` refaz, `Delete` apaga o elemento selecionado, `Esc` cancela a ferramenta.
- **Salvar / Abrir**: arquivos `.clp.json`. O programa também é salvo automaticamente no aplicativo.

## Memórias: lógica em M, saída Q só no final

Escrever a lógica direto nas saídas (`Q`) gasta endereços físicos à toa e espalha a mesma condição por vários degraus. A prática de quem programa CLP é montar a lógica em **memórias** (`M`, 64 endereços) e deixar cada `Q` para um degrau no final, só copiando o `M`:

```
Degrau 1:  ──┤ I0 ├──┤ I1 ├──( M0 )──      lógica de partida, em memória
Degrau 2:  ──┤ M0 ├──────────( Q0 )──      saída física, só copia
```

Todos os exemplos já seguem esse padrão. Para converter um programa seu:

- Selecione uma bobina de saída e use **Mover lógica para memória** (inspetor), ou
- abra a aba **Memória** e clique em **Mover para memórias** para converter todas de uma vez. Quem lia o `Q` passa a ler o `M`. Tudo é desfeito com `Ctrl+Z`.

A aba **Memória** (coluna da direita) também traz:

- **Uso de endereços**: quantos `I`, `Q`, `M`, `D`, `T`, `C`, `AI` e `AQ` o programa usa, e o mapa das memórias M e dos registradores D (livre / em uso / ligada / retentiva).
- **Variáveis ao vivo**: o valor de cada endereço em uso. Marque **Mostrar todos os endereços** para incluir os que o programa não usa.
- **R (retentivo)**: o endereço (M, D ou C) guarda o valor quando o CLP vai para STOP e volta para RUN. Use para contagens e estados que não podem se perder.
- **F (forçar)**: impõe um valor ao endereço, ignorando o programa, como o monitor de um CLP de verdade. Há um aviso âmbar na barra superior enquanto existir algum forçamento.
- **Zerar memória**: partida a frio, que apaga até os retentivos.

## Dados numéricos e analógico

Registradores `D0–D31` guardam inteiros de 32 bits (com estouro como num CLP). Operandos podem ser um endereço (`D`, `AI`, `AQ`, `T0.ACC`, `C0.ACC`) ou uma constante.

- **Comparar**: `=`, `≠`, `>`, `≥`, `<`, `≤` entre dois operandos. Passa energia quando a comparação é verdadeira.
- **MOV, ADD, SUB, MUL, DIV**: executam a cada varredura em que o degrau estiver energizado. Divisão por zero não altera o destino.
- **SCL**: converte uma faixa em outra, com limite nas pontas. Exemplo: `AI0` 0–27648 vira 0–100 % em `D0`.

## Comportamento de CLP real

- **Contatos de borda**: `P` (borda de subida) e `N` (borda de descida) conduzem por uma única varredura. Na interface eles piscam um instante, porque um ciclo é rápido demais para o olho.
- **Bits de sistema**: `S0` sempre ligado, `S1` primeiro ciclo depois do RUN, `S2` 2 Hz, `S3` 1 Hz, `S4` 0,5 Hz.
- **Falha segura**: a botoeira de DESLIGA é NF. Se o fio romper, o motor desliga.

## O que o motor implementa

Cada varredura lê as entradas, executa os degraus de cima para baixo e atualiza as saídas. As bobinas escrevem na hora, então os degraus seguintes já enxergam o novo valor, como num CLP real.

| Instrução | Comportamento |
| --- | --- |
| Contato NA / NF | passa energia quando o endereço vale 1 / 0 |
| Contato P / N | passa energia por uma varredura na borda de subida / descida |
| Comparar | passa energia quando a comparação entre dois valores é verdadeira |
| Bobina, negada | liga o endereço com / sem energia |
| SET / RESET | trava e destrava o endereço |
| TON | conta com energia; DN liga no preset; zera ao perder a energia |
| TOF | DN liga na hora e só desliga o preset depois da perda de energia |
| CTU | soma 1 a cada borda de subida; DN liga no preset |
| RES | zera um contador ou temporizador |
| MOV / ADD / SUB / MUL / DIV | copiam e calculam com inteiros de 32 bits |
| SCL | escala linear com limite, para sinais analógicos |
| Ramo em paralelo | OU entre ramos, com aninhamento |

Endereços:

| Faixa | O que é |
| --- | --- |
| `I0–I7`, `Q0–Q7` | entradas e saídas digitais |
| `M0–M63` | memórias (bits internos) |
| `D0–D31` | registradores de 32 bits |
| `T0–T7`, `C0–C7` | temporizadores e contadores (contato lê o bit DN; `.ACC` lê o acumulado) |
| `AI0–AI3`, `AQ0–AQ1` | entradas e saídas analógicas (0 a 27648) |
| `S0–S4` | bits de sistema |

O **Diagnóstico** avisa de erros comuns: bobina duplicada em dois degraus, temporizador usado duas vezes, contato ou RES apontando para um bloco que não existe, contato em saída ou memória que nenhum degrau escreve, registrador lido mas nunca escrito e divisão por constante zero.

## Estrutura

```
src/engine/       motor (sem React): tipos, varredura, edição, exemplos, salvar/abrir
src/hooks/        usePlc (loop em tempo real), useHistory (desfazer/refazer)
src/components/   Ladder, IOPanel, MemoryPanel, Palette, Inspector, TopBar
electron/main.cjs janela do aplicativo desktop
```

Testes: `npm test` (contatos, selo, TON/TOF, contador, estrela-triângulo, paralelos, comparadores, bordas, aritmética, SCL, bits de sistema, forçamento, retentividade, mover lógica para memória, salvar/abrir e o comportamento de cada exemplo).

## Próximas fases

**Fase 2 — o mundo lá fora**
- Falhas de campo: contator com atraso ou colado, relé térmico, fio rompido, filtro de entrada, com botão para injetar a falha.
- Processos simulados ligados às E/S: tanque, esteira, portão e elevador.

**Fase 3 — norma e integração**
- IEC 61131-3: SFC (GRAFCET) e Texto Estruturado (ST) ao lado do Ladder.
- Diagrama elétrico de força e comando.
- Servidor Modbus TCP, para conectar um SCADA ou IHM externo (roda no processo principal do Electron).
- PID e CTD/CTUD.
