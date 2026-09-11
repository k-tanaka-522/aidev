#!/usr/bin/env node
'use strict';

/**
 * diagram-gen.js（M4新設・共有ライブラリ）
 *
 * 【目的・理由】
 * 03文書8.5.2節が定める「第1段階Mermaidスケルトン→第2段階drawio別紙」の二段階生成を
 * 実装するための最小限の描画エンジンを提供する。`drawio-diagram` Skill（9.7節、要検証）
 * および各`reverse-doc`（02-01業務フロー、03-09バッチ処理フロー、04-01システム構成図、
 * 04-02ネットワーク構成図、07-00運用フロー図）が共通して使う。
 *
 * 【正直な限界表明（MUST、03文書8.5.3節・02文書9.7節の要検証事項を踏襲）】
 * `vidanov/aws-architecture-diagram-skill`相当の専用drawio作図スキルは、ライセンス条件
 * （商用利用・改変可否）を本セッションでは確認できないため**導入していない**（02文書9.7節
 * 「確認できるまで導入を保留する」に従う）。したがって本モジュールが生成するdrawio XMLは
 * **AWS4シェイプライブラリを使わない素朴な矩形＋矢印**に留まる（意匠は持たない）。
 * これは「導入できない場合の縮退案」として03文書8.5.2節が明示的に許容する構成
 * （第1段階のMermaidスケルトンのみで運用する）に、実務上のフォールバックとして
 * 簡易drawio別紙を追加したものであり、専用スキル導入の代替を主張するものではない。
 * 専用スキルのライセンス確認・導入可否は02文書15章#17の要検証のまま残る（本実装は
 * 解消しない）。
 *
 * 【影響範囲】
 * `.claude/skills/drawio-diagram/`、`docs/{02,03,04,07}_(各項番名)/.claude/skills/reverse-doc/scripts/*.js`。
 */

/**
 * ノード・エッジからMermaid flowchartのテキストを生成する（第1段階、常に成功する）。
 * nodes: [{ id, label }], edges: [{ from, to, label? }]
 */
function buildMermaidFlowchart(nodes, edges, direction = 'LR') {
  const lines = [`flowchart ${direction}`];
  for (const n of nodes) {
    lines.push(`    ${n.id}["${(n.label || n.id).replace(/"/g, "'")}"]`);
  }
  for (const e of edges) {
    const label = e.label ? `|${e.label}|` : '';
    lines.push(`    ${e.from} -->${label} ${e.to}`);
  }
  return lines.join('\n');
}

/**
 * ノード・エッジから素朴なdrawio（mxGraph）XMLを生成する（第2段階、簡易フォールバック。
 * 上部コメント参照。AWS4シェイプ等の意匠は持たない矩形＋矢印のみ）。
 * 座標はグリッド配置（等間隔）とし、レイアウトアルゴリズムは持たない。
 */
function buildSimpleDrawioXml(nodes, edges, { colWidth = 200, rowHeight = 100 } = {}) {
  const cellFor = (n, idx) => {
    const x = 40 + (idx % 4) * colWidth;
    const y = 40 + Math.floor(idx / 4) * rowHeight;
    return `        <mxCell id="${n.id}" value="${escapeXml(n.label || n.id)}" style="rounded=0;whiteSpace=wrap;html=1;" vertex="1" parent="1">
          <mxGeometry x="${x}" y="${y}" width="140" height="60" as="geometry" />
        </mxCell>`;
  };
  const edgeFor = (e, idx) => {
    return `        <mxCell id="edge${idx}" value="${escapeXml(e.label || '')}" style="edgeStyle=orthogonalEdgeStyle;rounded=0;html=1;" edge="1" parent="1" source="${e.from}" target="${e.to}">
          <mxGeometry relative="1" as="geometry" />
        </mxCell>`;
  };
  const cells = nodes.map(cellFor).join('\n');
  const edgeCells = edges.map(edgeFor).join('\n');
  return `<mxfile host="aidev-v2" version="1.0">
  <diagram name="Page-1">
    <mxGraphModel dx="800" dy="600" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="850" pageHeight="1100" math="0" shadow="0">
      <root>
        <mxCell id="0" />
        <mxCell id="1" parent="0" />
${cells}
${edgeCells}
      </root>
    </mxGraphModel>
  </diagram>
</mxfile>
`;
}

function escapeXml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

module.exports = { buildMermaidFlowchart, buildSimpleDrawioXml };
