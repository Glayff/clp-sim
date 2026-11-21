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

- **Rodar / Parar**: Parar desliga todas as saídas e zera a memória; Rodar faz uma partida a frio, como um CLP real.
- **Ciclo**: tempo de varredura (5 a 250 ms). Aumente para ver, na prática, como o tempo de ciclo afeta pulsos curtos e temporizadores.
- **Entradas**: cada uma pode ser chave seletora, botão NA ou botão NF (o seletor fica embaixo do nome). Botão NF dá nível 1 em repouso e 0 quando pressionado, como na botoeira de DESLIGA de uma partida.
- **Inserir**: escolha uma instrução na barra superior e clique em um **+** do degrau. A instrução inserida já fica selecionada para você trocar endereço, tipo e preset na coluna da direita.
- **Selo / OU**: selecione um contato e use **Em paralelo**. Depois insira outro contato no ramo de baixo.
- **Nomes**: digite o nome nas plaquetas das entradas e saídas, ou no inspetor para M, T e C. Os nomes aparecem no diagrama.
- **Exemplos**: partida com selo, TON, TOF, pisca-pisca, contador, estrela-triângulo e SET/RESET.
- **Atalhos**: `Ctrl+Z` desfaz, `Ctrl+Y` refaz, `Delete` apaga o elemento selecionado, `Esc` cancela a ferramenta.
- **Salvar / Abrir**: arquivos `.clp.json`. O programa também é salvo automaticamente no aplicativo.

## O que o motor implementa

Cada varredura lê as entradas, executa os degraus de cima para baixo e atualiza as saídas. As bobinas escrevem na hora, então os degraus seguintes já enxergam o novo valor, como num CLP real.

| Instrução | Comportamento |
| --- | --- |
| Contato NA / NF | passa energia quando o endereço vale 1 / 0 |
| Bobina, negada | liga o endereço com / sem energia |
| SET / RESET | trava e destrava o endereço |
| TON | conta com energia; DN liga no preset; zera ao perder a energia |
| TOF | DN liga na hora e só desliga o preset depois da perda de energia |
| CTU | soma 1 a cada borda de subida; DN liga no preset |
| RES | zera um contador ou temporizador |
| Ramo em paralelo | OU entre ramos, com aninhamento |

Endereços: `I0–I7`, `Q0–Q7`, `M0–M15`, `T0–T7`, `C0–C7`. Contato em `T` ou `C` lê o bit DN.

O **Diagnóstico** avisa de erros comuns: bobina duplicada em dois degraus, temporizador usado duas vezes, contato ou RES apontando para um bloco que não existe.

## Estrutura

```
src/engine/       motor (sem React): tipos, varredura, edição, exemplos, salvar/abrir
src/hooks/        usePlc (loop em tempo real), useHistory (desfazer/refazer)
src/components/   Ladder, IOPanel, Palette, Inspector, TopBar
electron/main.cjs janela do aplicativo desktop
```

Testes do motor: `npm test` (41 testes: contatos, selo, TON/TOF, contador, estrela-triângulo, paralelos, edição, salvar/abrir).

## Próximas fases

- Servidor Modbus TCP, para conectar um SCADA ou IHM externo (roda no processo principal do Electron).
- Texto Estruturado (ST) ao lado do Ladder.
- CTD/CTUD, contatos de borda (P/N), comparadores e aritmética.
- Processos simulados (tanque, esteira, semáforo) ligados às entradas e saídas.
