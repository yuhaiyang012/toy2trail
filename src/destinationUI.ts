import { ANIMAL_CAMP, ANIMAL_REWARDS, campGuidance, createDestination } from "./destination";
import { FOOD_QUALITIES, PICKUP_RADIUS, createDelivery, deliveryGuidance } from "./delivery";

export function createDestinationUI(quest: ReturnType<typeof createDestination>, hidden: boolean, replay: () => void, delivery?: ReturnType<typeof createDelivery>, nextOrder?: () => void) {
  const panel = document.getElementById("destination-card")!;
  const title = document.getElementById("destination-title")!;
  const distance = document.getElementById("destination-distance")!;
  const hint = document.getElementById("destination-hint")!;
  const collection = document.getElementById("animal-collection")!;
  const restart = document.getElementById("quest-replay") as HTMLButtonElement;
  const reward = document.getElementById("animal-reward")!;
  const saved = document.getElementById("reward-saved")!;
  const close = document.getElementById("reward-close") as HTMLButtonElement;
  const next = document.getElementById("delivery-next") as HTMLButtonElement;
  const meta = document.getElementById("delivery-meta")!;
  const progress = document.getElementById("delivery-progress")!;
  const cargo = document.getElementById("delivery-cargo")!;
  const score = document.getElementById("delivery-score")!;
  const label = panel.querySelector(".destination-label > span")!;
  document.getElementById("minimap")!.classList.toggle("delivery-map", !!delivery);
  meta.hidden = !delivery;
  panel.hidden = hidden;
  document.getElementById("reward-animals")!.innerHTML = ANIMAL_REWARDS.map(a =>
    `<div class="animal-sticker"><span aria-hidden="true">${a.icon}</span><b>${a.name}</b><small>${a.kind}</small></div>`).join("");
  collection.innerHTML = ANIMAL_REWARDS.map(a => `<span title="${a.name} · ${a.kind}" aria-label="${a.name}，${a.kind}">${a.icon}</span>`).join("");
  let lastPaint = -Infinity;
  close.onclick = () => { reward.hidden = true; close.blur(); };
  restart.onclick = () => { reward.hidden = true; lastPaint = -Infinity; replay(); restart.blur(); };
  next.onclick = () => { reward.hidden = true; lastPaint = -Infinity; nextOrder?.(); next.blur(); };
  return {
    showReward() {
      if (hidden) return;
      reward.querySelector(".reward-eyebrow")!.textContent = "抵达山顶 · 探险完成";
      reward.querySelector("h2")!.textContent = "遇见新伙伴！";
      reward.querySelector("p")!.textContent = "一路翻山，换来三位小朋友。";
      close.textContent = "收下啦，继续探索 →";
      saved.textContent = quest.saved ? "伙伴已收藏 · 复位车辆也会保留" : "伙伴已收藏到本次游戏 · 复位车辆也会保留";
      reward.hidden = false;
    },
    showFeeding() {
      if (hidden || !delivery) return;
      const quality = FOOD_QUALITIES[delivery.state.order.quality];
      reward.querySelector(".reward-eyebrow")!.textContent = "补给送达 · 动物开饭啦";
      reward.querySelector("h2")!.textContent = "谢谢你的食物！";
      reward.querySelector("p")!.textContent = `${quality.name}食物箱送达，获得 ${quality.hearts} 颗爱心。`;
      saved.textContent = `累计 ${delivery.state.hearts} ♥ · 已送 ${delivery.state.meals} 趟${delivery.saved ? " · 已保存" : " · 本次游戏保留"}`;
      close.textContent = "吃饱啦，继续探索 →";
      reward.hidden = false;
    },
    dismiss() { reward.hidden = true; lastPaint = -Infinity; },
    update(now: number, x: number, z: number) {
      if (hidden || now - lastPaint < 100) return;
      lastPaint = now;
      const guidance = campGuidance(x, z);
      title.textContent = quest.completed ? "三位伙伴，集齐啦！" : ANIMAL_CAMP.name;
      distance.textContent = quest.completed ? "3 / 3" : `约 ${Math.ceil(guidance.remaining)} m`;
      hint.textContent = quest.completed ? "继续探索，或再出发一次" : guidance.distance <= 20 ? "前方金色营地，开进去见伙伴" : guidance.offRoute > 18 ? "回到金色路线，再沿土路上山" : guidance.progress < 45 ? "跟随金色路线，绕石进入山道" : "沿金色路线登山，伙伴在山顶";
      collection.hidden = !quest.completed;
      restart.hidden = !quest.completed;
      panel.classList.toggle("complete", quest.completed);
      panel.dataset.completed = String(quest.completed);
      panel.dataset.distance = guidance.distance.toFixed(2);
      if (delivery) {
        const state = delivery.state, pickup = state.phase === "pickup", finished = state.phase === "delivered";
        const nav = deliveryGuidance(x, z, state), quality = FOOD_QUALITIES[state.order.quality];
        label.textContent = `动物补给 · 第 ${state.order.id} 单`;
        title.textContent = pickup ? "1/2 · 去取食物" : finished ? "送达！伙伴开饭啦" : "2/2 · 送往动物营地";
        distance.textContent = finished ? "完成 ✓" : `约 ${Math.ceil(nav.remaining)} m`;
        hint.textContent = finished ? "可以再接一单，找新一批食物" : nav.distance <= (pickup ? PICKUP_RADIUS : ANIMAL_CAMP.radius)
          ? delivery.progress > 0 ? `${pickup ? "正在装货" : "正在卸货"} ${Math.round(delivery.progress * 100)}% · 保持停稳` : `松开油门并刹停，自动${pickup ? "装货" : "喂食"}`
          : nav.offRoute > 18 ? "回到地图路线，再前往目标" : pickup ? "沿绿色路线取粮，到站停稳装货" : "沿金色路线送达，营地停稳卸货";
        cargo.textContent = pickup ? "品质待揭晓" : `${quality.name} · ${finished ? `+${quality.hearts} ♥` : "车载 1 箱"}`;
        cargo.style.color = pickup ? "#6f7b68" : quality.color;
        score.textContent = `♥ ${state.hearts} · ${state.meals} 趟`;
        progress.hidden = delivery.progress <= 0 || finished;
        progress.setAttribute("aria-valuenow", String(Math.round(delivery.progress * 100)));
        (progress.firstElementChild as HTMLElement).style.width = `${delivery.progress * 100}%`;
        next.hidden = !finished;
        restart.textContent = "重玩探险 ↗";
        panel.classList.toggle("complete", finished);
        panel.dataset.phase = state.phase;
        panel.dataset.distance = nav.distance.toFixed(2);
      }
    },
  };
}
