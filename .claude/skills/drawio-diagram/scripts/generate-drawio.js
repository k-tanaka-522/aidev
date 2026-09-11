#!/usr/bin/env node
'use strict';

/**
 * generate-drawio.js（drawio-diagram Skill 同梱スクリプト）
 *
 * 【使い方】
 *   node generate-drawio.js --nodes=<jsonファイル> --out=<出力先.drawio> [--mermaid-out=<出力先.mmd>]
 *
 * nodes.json形式: { "nodes": [{"id":"a","label":"A"}], "edges": [{"from":"a","to":"b","label":"..."}] }
 *
 * 【契約】
 * 対象外と判定した（coderの一次判定、PMへ報告）。渡された`nodes`/`edges`をmermaid/
 * drawio形式へ機械的に変換して書き出すだけの処理であり、Gate判定の分母・分子集計
 * （16.6節(a)）、複数エントリの横断集計（(c)）、fail-closedの判定（(d)）のいずれにも
 * 該当しない。
 */

const fs = require('fs');
const path = require('path');
const { buildMermaidFlowchart, buildSimpleDrawioXml } = require('../../../lib/diagram-gen');

function parseArgs(argv) {
  const args = {};
  for (const raw of argv) {
    const m = /^--([^=]+)=([\s\S]*)$/.exec(raw);
    if (m) args[m[1]] = m[2];
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.nodes || !args.out) {
    console.error('[generate-drawio] --nodes=<jsonファイル> --out=<出力先.drawio> は必須です');
    process.exit(1);
  }
  const spec = JSON.parse(fs.readFileSync(args.nodes, 'utf-8'));
  const mermaid = buildMermaidFlowchart(spec.nodes, spec.edges, spec.direction);
  const drawio = buildSimpleDrawioXml(spec.nodes, spec.edges);

  fs.mkdirSync(path.dirname(args.out), { recursive: true });
  fs.writeFileSync(args.out, drawio, 'utf-8');

  if (args['mermaid-out']) {
    fs.mkdirSync(path.dirname(args['mermaid-out']), { recursive: true });
    fs.writeFileSync(args['mermaid-out'], mermaid, 'utf-8');
  }

  console.log(JSON.stringify({ status: 'done', drawio: args.out, mermaidOut: args['mermaid-out'] || null, mermaid }, null, 2));
}

main();
