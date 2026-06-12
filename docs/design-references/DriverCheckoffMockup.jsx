import { useState } from "react";
import {
  Check, Plus, Minus, ChevronLeft, Wrench, AlertTriangle,
  Package, RotateCcw, Truck, X, CheckCircle2
} from "lucide-react";

/* ── PartyTime Work driver-app tokens (matched to existing app DNA) ── */
const C = {
  blue: "#0a14ff",       // brand primary hero
  blueDeep: "#0610c4",
  gold: "#FFB800",
  goldInk: "#3a2a00",
  green: "#16a34a",
  greenTint: "#e9f8ef",
  red: "#DC2626",
  redTint: "#fdeced",
  amber: "#D97706",
  amberTint: "#fdf2e3",
  ink: "#15171c",
  sub: "#6b7280",
  line: "#e9eaee",
  page: "#f6f4ef",
  card: "#ffffff",
};
const FONT = "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";

const SEED = [
  { id: "a", name: "Chiavari Chair — Gold", ordered: 100 },
  { id: "b", name: '60" Round Table', ordered: 12 },
  { id: "c", name: "Frame Tent 20×30", ordered: 1 },
  { id: "d", name: "Linen — Ivory", ordered: 12 },
  { id: "e", name: "Cocktail Table", ordered: 6 },
];

function freshState(items) {
  const m = {};
  items.forEach((i) => (m[i.id] = { status: "pending", qty: i.ordered, damaged: false }));
  return m;
}

export default function DriverCheckoffMockup() {
  const [mode, setMode] = useState("delivery"); // 'delivery' | 'pickup'
  const [state, setState] = useState(() => freshState(SEED));
  const [openFlag, setOpenFlag] = useState(null);
  const [done, setDone] = useState(false);

  const isPickup = mode === "pickup";
  const verb = isPickup ? "Pickup" : "Delivery";
  const tgStatus = isPickup ? "checked_in" : "in_use";

  const reset = (m) => {
    setMode(m);
    setState(freshState(SEED));
    setOpenFlag(null);
    setDone(false);
  };

  const setLine = (id, patch) =>
    setState((s) => ({ ...s, [id]: { ...s[id], ...patch } }));

  const acceptClean = (id) => {
    const cur = state[id];
    if (cur.status === "clean") {
      setLine(id, { status: "pending" }); // tap green check to undo
    } else {
      const it = SEED.find((x) => x.id === id);
      setLine(id, { status: "clean", qty: it.ordered, damaged: false });
      if (openFlag === id) setOpenFlag(null);
    }
  };

  const confirmAll = () => {
    setState((s) => {
      const n = { ...s };
      SEED.forEach((it) => {
        if (n[it.id].status === "pending")
          n[it.id] = { status: "clean", qty: it.ordered, damaged: false };
      });
      return n;
    });
    setOpenFlag(null);
  };

  const changeQty = (id, delta) => {
    const it = SEED.find((x) => x.id === id);
    setState((s) => {
      const q = Math.max(0, Math.min(it.ordered, s[id].qty + delta));
      const ex = q < it.ordered || s[id].damaged;
      return { ...s, [id]: { ...s[id], qty: q, status: ex ? "exception" : "clean" } };
    });
  };

  const toggleDamage = (id) => {
    setState((s) => {
      const d = !s[id].damaged;
      const it = SEED.find((x) => x.id === id);
      const ex = d || s[id].qty < it.ordered;
      return { ...s, [id]: { ...s[id], damaged: d, status: ex ? "exception" : "clean" } };
    });
  };

  const resolved = SEED.filter((i) => state[i.id].status !== "pending").length;
  const allDone = resolved === SEED.length;
  const shorts = SEED.filter((i) => state[i.id].qty < i.ordered);
  const damaged = SEED.filter((i) => state[i.id].damaged);
  const shortUnits = shorts.reduce((n, i) => n + (i.ordered - state[i.id].qty), 0);

  return (
    <div style={{ fontFamily: FONT, background: "#e7e4dc", minHeight: "100%", padding: "20px 0 40px", color: C.ink }}>
      {/* mode switch (outside the phone — design control) */}
      <div style={{ display: "flex", justifyContent: "center", gap: 8, marginBottom: 16 }}>
        {["delivery", "pickup"].map((m) => (
          <button key={m} onClick={() => reset(m)}
            style={{
              border: "none", cursor: "pointer", padding: "8px 18px", borderRadius: 999,
              fontWeight: 700, fontSize: 13, letterSpacing: 0.2,
              background: mode === m ? C.ink : "#fff",
              color: mode === m ? "#fff" : C.sub,
              boxShadow: mode === m ? "none" : "0 1px 2px rgba(0,0,0,.06)",
            }}>
            {m === "delivery" ? "Delivery stop" : "Pickup stop"}
          </button>
        ))}
      </div>

      {/* phone frame */}
      <div style={{
        width: 390, margin: "0 auto", background: C.page, borderRadius: 38,
        boxShadow: "0 18px 50px rgba(0,0,0,.28)", overflow: "hidden",
        border: "10px solid #0c0c10", position: "relative", minHeight: 760,
      }}>
        {/* status bar */}
        <div style={{ height: 30, background: C.blue, display: "flex", alignItems: "center",
          justifyContent: "space-between", padding: "0 22px", color: "#fff", fontSize: 12, fontWeight: 600 }}>
          <span>10:45</span><span>PTR</span>
        </div>

        {/* header */}
        <div style={{ background: C.blue, color: "#fff", padding: "10px 18px 18px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <ChevronLeft size={22} />
            <span style={{ fontSize: 13, fontWeight: 600, opacity: .85 }}>Stop 2 of 3</span>
            <span style={{
              display: "inline-flex", alignItems: "center", gap: 5, background: isPickup ? C.gold : "#fff",
              color: isPickup ? C.goldInk : C.blue, fontWeight: 800, fontSize: 11, padding: "4px 10px",
              borderRadius: 999, letterSpacing: .4 }}>
              {isPickup ? <RotateCcw size={12} /> : <Truck size={12} />}
              {isPickup ? "PICKUP" : "DELIVERY"}
            </span>
          </div>
          <div style={{ marginTop: 14 }}>
            <div style={{ fontSize: 24, fontWeight: 800, lineHeight: 1.1 }}>Greenfield Estate</div>
            <div style={{ fontSize: 14, opacity: .85, marginTop: 2 }}>Sandra Bell · 1820 Greenfield Way</div>
          </div>
        </div>

        {/* confirm-items block */}
        <div style={{ padding: "16px 16px 120px" }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 10 }}>
            <span style={{ fontSize: 15, fontWeight: 800 }}>
              {isPickup ? "Check items back in" : "Check items out"}
            </span>
            <span style={{ fontSize: 13, fontWeight: 700, color: allDone ? C.green : C.sub }}>
              {resolved} of {SEED.length} confirmed
            </span>
          </div>

          {/* one-tap happy path */}
          <button onClick={confirmAll}
            style={{
              width: "100%", border: "none", cursor: "pointer", background: C.gold, color: C.goldInk,
              fontWeight: 800, fontSize: 15, padding: "13px", borderRadius: 14, marginBottom: 14,
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              boxShadow: "0 2px 0 rgba(0,0,0,.08)",
            }}>
            <Check size={18} strokeWidth={3} /> Confirm all items — all good
          </button>

          {/* item list */}
          {SEED.map((it) => {
            const st = state[it.id];
            const short = st.qty < it.ordered;
            const flagOpen = openFlag === it.id;
            const tint =
              st.status === "exception" ? (st.damaged && !short ? C.redTint : C.amberTint)
              : st.status === "clean" ? C.greenTint : "#fff";
            const bd =
              st.status === "exception" ? (st.damaged && !short ? C.red : C.amber)
              : st.status === "clean" ? C.green : C.line;

            return (
              <div key={it.id} style={{
                background: tint, border: `1.5px solid ${bd}`, borderRadius: 14, marginBottom: 10,
                overflow: "hidden", transition: "background .15s",
              }}>
                <div style={{ display: "flex", alignItems: "center", padding: "12px 12px 12px 14px", gap: 12 }}>
                  {/* accept circle */}
                  <button onClick={() => acceptClean(it.id)} aria-label="accept"
                    style={{
                      flexShrink: 0, width: 30, height: 30, borderRadius: 999, cursor: "pointer",
                      border: st.status === "clean" || (st.status === "exception" && !short)
                        ? "none" : `2px solid ${C.line}`,
                      background: st.status === "clean" ? C.green
                        : st.status === "exception" && !short ? C.green
                        : st.status === "exception" && short ? C.amber : "#fff",
                      display: "flex", alignItems: "center", justifyContent: "center", color: "#fff",
                    }}>
                    {st.status === "clean" && <Check size={17} strokeWidth={3} />}
                    {st.status === "exception" && !short && <Check size={17} strokeWidth={3} />}
                    {st.status === "exception" && short && <span style={{ fontWeight: 800, fontSize: 12 }}>{st.qty}</span>}
                  </button>

                  {/* name + qty */}
                  <div style={{ flex: 1, minWidth: 0 }} onClick={() => acceptClean(it.id)}>
                    <div style={{ fontWeight: 700, fontSize: 14.5, lineHeight: 1.2 }}>{it.name}</div>
                    <div style={{ fontSize: 12.5, color: C.sub, marginTop: 2, display: "flex", gap: 6, flexWrap: "wrap" }}>
                      <span>{isPickup ? "Out" : "Ordered"} ×{it.ordered}</span>
                      {short && <span style={{ color: C.amber, fontWeight: 700 }}>· {st.qty} back · {it.ordered - st.qty} short</span>}
                      {st.damaged && (
                        <span style={{ color: C.red, fontWeight: 700, display: "inline-flex", alignItems: "center", gap: 3 }}>
                          <Wrench size={11} /> Damaged · WO
                        </span>
                      )}
                    </div>
                  </div>

                  {/* flag toggle */}
                  <button onClick={() => setOpenFlag(flagOpen ? null : it.id)}
                    style={{
                      flexShrink: 0, border: "none", cursor: "pointer", background: flagOpen ? C.ink : "transparent",
                      color: flagOpen ? "#fff" : C.sub, borderRadius: 9, padding: "6px 9px", fontSize: 12, fontWeight: 700,
                      display: "inline-flex", alignItems: "center", gap: 4,
                    }}>
                    {flagOpen ? <X size={14} /> : <AlertTriangle size={14} />}
                    {flagOpen ? "" : "Issue"}
                  </button>
                </div>

                {/* exception drawer */}
                {flagOpen && (
                  <div style={{ borderTop: `1px solid ${bd}`, padding: 12, background: "rgba(255,255,255,.55)" }}>
                    {/* quantity */}
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 13 }}>{isPickup ? "Quantity returned" : "Quantity delivered"}</div>
                        <div style={{ fontSize: 11.5, color: C.sub }}>
                          {short ? `${it.ordered - st.qty} short → noted to dispatch` : "Full quantity"}
                        </div>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <button onClick={() => changeQty(it.id, -1)} style={stepBtn}><Minus size={15} /></button>
                        <span style={{ fontWeight: 800, fontSize: 16, minWidth: 34, textAlign: "center" }}>{st.qty}</span>
                        <button onClick={() => changeQty(it.id, +1)} style={stepBtn}><Plus size={15} /></button>
                      </div>
                    </div>

                    {/* damage */}
                    <button onClick={() => toggleDamage(it.id)}
                      style={{
                        width: "100%", border: `1.5px solid ${st.damaged ? C.red : C.line}`, cursor: "pointer",
                        background: st.damaged ? C.redTint : "#fff", borderRadius: 11, padding: "10px 12px",
                        display: "flex", alignItems: "center", gap: 10, textAlign: "left",
                      }}>
                      <span style={{
                        width: 22, height: 22, borderRadius: 6, flexShrink: 0,
                        border: st.damaged ? "none" : `2px solid ${C.line}`,
                        background: st.damaged ? C.red : "#fff", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff",
                      }}>{st.damaged && <Check size={14} strokeWidth={3} />}</span>
                      <span style={{ flex: 1 }}>
                        <span style={{ fontWeight: 700, fontSize: 13, display: "block" }}>Item damaged</span>
                        <span style={{ fontSize: 11.5, color: C.sub }}>
                          {isPickup
                            ? "Counts as returned — opens a repair work order"
                            : "Replaced in field — opens a repair work order if repairable"}
                        </span>
                      </span>
                      <Wrench size={16} color={st.damaged ? C.red : C.sub} />
                    </button>

                    {st.damaged && (
                      <div style={{
                        marginTop: 10, background: "#fff", border: `1px dashed ${C.red}`, borderRadius: 10,
                        padding: "9px 11px", fontSize: 12, color: C.ink, display: "flex", alignItems: "center", gap: 8,
                      }}>
                        <Wrench size={14} color={C.red} />
                        <span>Work order pre-filled: <b>{it.name}</b> · order #6312731E · Greenfield Estate</span>
                      </div>
                    )}

                    <button onClick={() => setOpenFlag(null)}
                      style={{
                        width: "100%", marginTop: 12, border: "none", cursor: "pointer", background: C.ink, color: "#fff",
                        fontWeight: 800, fontSize: 13.5, padding: "11px", borderRadius: 11,
                      }}>
                      Done with this item
                    </button>
                  </div>
                )}
              </div>
            );
          })}

          {/* exception summary */}
          {(shorts.length > 0 || damaged.length > 0) && (
            <div style={{
              marginTop: 6, background: "#fff", border: `1px solid ${C.line}`, borderRadius: 14, padding: 14,
            }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: C.sub, letterSpacing: .5, marginBottom: 8 }}>
                WHAT HAPPENS ON COMPLETE
              </div>
              {shorts.length > 0 && (
                <Row icon={<AlertTriangle size={15} color={C.amber} />}>
                  <b>{shortUnits} unit{shortUnits > 1 ? "s" : ""} short</b> across {shorts.length} item{shorts.length > 1 ? "s" : ""} → note to Melissa
                  <span style={{ color: C.sub }}> (credit or schedule a return)</span>
                </Row>
              )}
              {damaged.length > 0 && (
                <Row icon={<Wrench size={15} color={C.red} />}>
                  <b>{damaged.length} work order{damaged.length > 1 ? "s" : ""}</b> created for damaged item{damaged.length > 1 ? "s" : ""}
                </Row>
              )}
              <Row icon={<Package size={15} color={C.green} />}>
                Real quantities written to TapGoods as <b style={{ fontFamily: "ui-monospace, monospace" }}>{tgStatus}</b>
              </Row>
            </div>
          )}
        </div>

        {/* sticky completion gate */}
        <div style={{
          position: "absolute", left: 0, right: 0, bottom: 0, padding: "14px 16px 18px",
          background: "linear-gradient(180deg, rgba(246,244,239,0) 0%, " + C.page + " 32%)",
        }}>
          <button disabled={!allDone} onClick={() => allDone && setDone(true)}
            style={{
              width: "100%", border: "none", cursor: allDone ? "pointer" : "not-allowed",
              background: allDone ? C.blue : "#d6d4ce", color: allDone ? "#fff" : "#9b9890",
              fontWeight: 800, fontSize: 16, padding: "15px", borderRadius: 16,
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              boxShadow: allDone ? "0 4px 14px rgba(10,20,255,.32)" : "none",
            }}>
            {allDone
              ? <>Mark {verb} Complete</>
              : <>Confirm all items first · {resolved} of {SEED.length}</>}
          </button>
          <div style={{ textAlign: "center", fontSize: 11, color: C.sub, marginTop: 8 }}>
            Saved on your phone · TapGoods sync runs automatically
          </div>
        </div>

        {/* success overlay */}
        {done && (
          <div style={{
            position: "absolute", inset: 0, background: "rgba(8,10,30,.55)",
            display: "flex", alignItems: "flex-end",
          }}>
            <div style={{ background: "#fff", borderRadius: "24px 24px 0 0", width: "100%", padding: "22px 20px 26px" }}>
              <div style={{ display: "flex", justifyContent: "center", marginBottom: 8 }}>
                <CheckCircle2 size={48} color={C.green} />
              </div>
              <div style={{ textAlign: "center", fontSize: 19, fontWeight: 800 }}>{verb} complete</div>
              <div style={{ textAlign: "center", fontSize: 13, color: C.sub, marginBottom: 16 }}>
                Stop 2 closed — on to your next stop
              </div>
              <div style={{ background: C.page, borderRadius: 12, padding: 12, fontSize: 13 }}>
                <Row icon={<Package size={15} color={C.green} />}>
                  {SEED.length} items written to TapGoods as <b style={{ fontFamily: "ui-monospace, monospace" }}>{tgStatus}</b>
                </Row>
                {shorts.length > 0 && (
                  <Row icon={<AlertTriangle size={15} color={C.amber} />}>
                    Discrepancy note sent to Melissa
                  </Row>
                )}
                {damaged.length > 0 && (
                  <Row icon={<Wrench size={15} color={C.red} />}>
                    {damaged.length} repair work order{damaged.length > 1 ? "s" : ""} opened
                  </Row>
                )}
              </div>
              <button onClick={() => reset(mode)}
                style={{
                  width: "100%", marginTop: 16, border: "none", cursor: "pointer", background: C.ink, color: "#fff",
                  fontWeight: 800, fontSize: 15, padding: "13px", borderRadius: 14,
                }}>
                Replay
              </button>
            </div>
          </div>
        )}
      </div>

      <p style={{ textAlign: "center", color: "#7a776f", fontSize: 12, marginTop: 16, maxWidth: 390, marginLeft: "auto", marginRight: "auto", lineHeight: 1.5 }}>
        Tap a row to accept it · tap <b>Issue</b> to adjust quantity or flag damage · the
        complete button stays locked until every item is confirmed. Flip between Delivery and Pickup up top.
      </p>
    </div>
  );
}

const stepBtn = {
  width: 34, height: 34, borderRadius: 10, border: "1.5px solid #e9eaee", background: "#fff",
  cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#15171c",
};

function Row({ icon, children }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 9, padding: "4px 0", fontSize: 13, lineHeight: 1.4 }}>
      <span style={{ marginTop: 1, flexShrink: 0 }}>{icon}</span>
      <span>{children}</span>
    </div>
  );
}
