import { presets } from '../rules/presets.mjs?v=141';

const tunRules = {
  six: {
    bands: [['6–8', '1 囤'], ['9–11', '2 囤'], ['12 起', '12–14 为 3 囤，之后每多 3 胡息加 1 囤']],
    example: '9 胡息平胡为 2 囤。胡墩上摸出的牌，其他三家各扣 2 分，胡家加 6 分。'
  },
  ten: {
    bands: [['正好 10', '3 囤'], ['11', '1 囤'], ['12–14', '2 囤'], ['15–17', '3 囤'], ['18 起', '18–20 为 4 囤，之后每多 3 胡息加 1 囤']],
    example: '10 胡息平胡为 3 囤。放炮胡时，放炮人扣 6 分，胡家加 6 分。'
  },
  fifteen: {
    bands: [['10–14（黑胡）', '1 囤'], ['15–17', '1 囤'], ['18–20', '2 囤'], ['21 起', '21–23 为 3 囤，之后每多 3 胡息加 1 囤']],
    example: '18 胡息、十红为 2 囤 × 2，每份 4 分。胡墩上摸出的牌，其他两家各扣 4 分，胡家加 8 分。'
  }
};

function ruleTable(caption, headings, rows) {
  return `<table>
    <caption>${caption}</caption>
    <thead><tr>${headings.map(heading => `<th scope="col">${heading}</th>`).join('')}</tr></thead>
    <tbody>${rows.map(([label, ...cells]) => `<tr><th scope="row">${label}</th>${cells.map(cell => `<td>${cell}</td>`).join('')}</tr>`).join('')}</tbody>
  </table>`;
}

function paohuziTutorial(mode) {
  const { seats, dealt, minimum } = presets[mode];
  const groups = (dealt + 1) / 3;
  const { bands, example } = tunRules[mode];
  return [
    ruleTable('一局怎么打', ['阶段', '怎么做'], [
      ['开局', `${seats} 人，每人先发 ${dealt} 张，另留一张庄家亮张。`],
      ['轮转', '逆时针行牌。轮到你时，按桌上的按钮操作。'],
      ['摸牌', '从牌墩摸出的牌公开亮出。无人取用时，放进弃牌区。'],
      ['出牌', '点一张手牌，再点「出牌」。拖动手牌可重新排组。'],
      ['结束', '有人胡牌就结算。牌墩空后，等所有动作处理完，自动黄庄。']
    ]) + ruleTable('桌上动作', ['动作', '什么时候用'], [
      ['吃', '用自己摸出或上家亮出的牌凑牌组。手里还有同名牌时，也要配成组一起落地。'],
      ['碰', '手里有一对，别人摸出或打出第三张同名牌时可碰。自己打过的同名牌不能再碰。'],
      ['偎', '自己摸到手里一对的第三张，自动落地。曾放弃碰这张牌的，叫臭偎。'],
      ['跑／提', '手里的坎不能拆。第四张到来时，自动跑或提。原来的碰或偎也可升级成四张。'],
      ['冲跑', '打出别人已经偎过的第四张并让对方跑牌后，本局不能再吃、碰。'],
      ['过', '放弃这次机会。过吃或过碰后，本局同名牌会受对应限制。']
    ]),
    ruleTable('胡牌条件', ['看什么', '规则'], [
      ['组数', `手牌和落地牌合计 ${groups} 组，所有牌都要组好。跑、提各算一组，拆牌需要将时用一对同名牌。`],
      ['起胡线', mode === 'fifteen' ? '一般至少 15 胡息。整副牌零红字时，至少 10 胡息。' : `至少 ${minimum} 胡息。`],
      ['胡哪张', '自己或别人从牌墩摸出的牌都可胡。开启「放炮胡」后，也可胡别人打出的牌。'],
      ['胡息', '把成胡牌组的胡息加起来。对局中，头像下显示已落地牌的胡息。']
    ]) + ruleTable('牌型与胡息', ['牌型', '例子', '小字', '大字'], [
      ['对子（将）', '四四／肆肆', '0', '0'],
      ['碰', '四四四／肆肆肆', '1', '3'],
      ['坎／偎', '四四四／肆肆肆', '3', '6'],
      ['跑', '四四四四／肆肆肆肆', '6', '9'],
      ['提', '四四四四／肆肆肆肆', '9', '12'],
      ['一二三／二七十', '一二三／贰柒拾', '3', '6'],
      ['一五十（开启时）', '一五十／壹伍拾', '3', '6'],
      ['其他同字号顺子', '二三四／贰叁肆', '0', '0'],
      ['同点数大小三搭', '四四肆／四肆肆', '0', '0']
    ]),
    ruleTable('胡息换囤', ['胡息', '囤数'], bands)
      + ruleTable('常见名堂', ['名堂', '条件', '倍率'], [
        ['黑胡', '0 张红字', '×5'],
        ['点胡', '1 张红字', '×3'],
        ['十红', '10–12 张红字', '×2'],
        ['十三红', '13 张及以上红字', '×5'],
        ['天胡', '庄家胡自己的首发亮张', '×5'],
        ['地胡', '胡本局第一张从手里打出的牌', '×5'],
        ['平胡／自摸', '没有名堂为平胡，胡自己摸出的牌为自摸', '×1']
      ]) + '<p>大小字的二、七、十都是红字。每份分数 = 囤数 × 各项名堂倍率。</p>'
      + ruleTable('谁付分', ['结果', '积分和下局'], [
        ['胡墩牌／亮张', `其他玩家各付一份，胡家收 ${seats - 1} 份并坐下局庄。`],
        ['放炮胡', `出牌人包付 ${seats - 1} 份，胡家坐下局庄。`],
        ['黄庄', '各家 0 分，原庄的下家接庄。']
      ]) + `<p>${example}</p>`
  ];
}

function mahjongTutorial() {
  return [
    ruleTable('一局怎么打', ['阶段', '怎么做'], [
      ['开局', '3–5 人，庄家 11 张，闲家 10 张。庄家先胡或先出牌。'],
      ['轮转', '逆时针行牌，轮到你时可吃上家刚打出的牌，或从牌墩摸一张。'],
      ['摸牌', '摸出的牌直接收入手牌，只有自己看见。'],
      ['暗吃', '取上家刚打出的牌，直接收入手牌，随后出一张。'],
      ['出牌', '点一张手牌，再点「出牌」。拖动手牌可重新排组。'],
      ['结束', '有人胡牌，或轮到摸牌时牌墩已空（黄庄），进入结算。']
    ]),
    ruleTable('胡牌条件', ['看什么', '规则'], [
      ['成胡', '11 张牌全部拆成三个顺子和一个对子。'],
      ['自摸', '自己摸出的牌让你成胡。庄家起手胡也算自摸。'],
      ['接炮', '任一对手打出的牌让你成胡。'],
      ['过胡', '放过一次接炮后，实际摸牌或暗吃才恢复接炮资格。']
    ]) + ruleTable('成胡牌型', ['牌型', '规则', '例子'], [
      ['普通顺子', '同字号的三个连续点数', '一二三、陆柒捌'],
      ['一五十', '同字号的一、五、十', '一五十、壹伍拾'],
      ['二七十', '同字号的二、七、十', '二七十、贰柒拾'],
      ['对子', '两张完全同名的牌', '四四、玖玖']
    ]) + '<p>成胡示例：一二三／二七十／壹伍拾／四四。</p>',
    ruleTable('按胡牌方式计分', ['结果', '谁扣分', '胡家加分'], [
      ['接炮', '放炮人扣 1 分', '1 分'],
      ['自摸', '其他玩家各扣 1 分', '3／4／5 人局分别加 2／3／4 分'],
      ['黄庄', '各家 0 分', '0 分']
    ]) + '<p>麻雀牌按结果直接计分。有人胡牌时，胡家坐下局庄。黄庄时，本局庄家的下家接庄。</p>'
  ];
}

export function bindTutorial(dialog) {
  const title = dialog.querySelector('#tutorial-title');
  const tabs = [...dialog.querySelectorAll('[role="tab"]')];
  const panels = tabs.map(tab => dialog.querySelector(`#${tab.getAttribute('aria-controls')}`));

  function select(index) {
    tabs.forEach((tab, i) => {
      const selected = i === index;
      tab.setAttribute('aria-selected', selected);
      tab.tabIndex = selected ? 0 : -1;
      tab.classList.toggle('primary', selected);
      panels[i].hidden = !selected;
    });
    panels[index].scrollTop = 0;
  }

  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => select(index));
    tab.addEventListener('keydown', event => {
      const next = {
        ArrowLeft: (index - 1 + tabs.length) % tabs.length,
        ArrowRight: (index + 1) % tabs.length,
        Home: 0,
        End: tabs.length - 1
      }[event.key];
      if (next === undefined) return;
      event.preventDefault();
      select(next);
      tabs[next].focus();
    });
  });

  return mode => {
    title.textContent = `${presets[mode].name}教程`;
    const content = mode === 'mahjong' ? mahjongTutorial() : paohuziTutorial(mode);
    panels.forEach((panel, i) => { panel.innerHTML = content[i]; });
    select(0);
    dialog.showModal();
  };
}
