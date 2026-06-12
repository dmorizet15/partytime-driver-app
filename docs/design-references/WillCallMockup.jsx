import { useState } from "react";
import {
  Check, Plus, Minus, ChevronLeft, Wrench, AlertTriangle,
  Package, CheckCircle2, X, Phone, ChevronRight, User
} from "lucide-react";

const C = {
  blue: "#0a14ff",
  blueDeep: "#0610c4",
  gold: "#FFB800",
  goldInk: "#3a2a00",
  goldTint: "#fffbeb",
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

const ORDERS = [
  {
    id: "WC-4821",
    customer: "Sandra Bell",
    phone: "845-555-0198",
    pickupTime: "Today · 1:00 PM",
    returnDate: "Jun 15",
    items: [
      { id: "a", name: "Chiavari Chair — Gold", qty: 50 },
      { id: "b", name: '60" Round Table', qty: 8 },
      { id: "c", name: "Linen — Ivory", qty: 8 },
    ],
  },
  {
    id: "WC-4795",
    customer: "Maria Torres",
    phone: "845-555-0143",
    pickupTime: "Jun 10 · 2:00 PM",
    returnDate: "Jun 11 — OVERDUE",
    items: [
      { id: "a", name: "Chiavari Chair — White", qty: 30 },
      { id: "b", name: "Cocktail Table", qty: 5 },
    ],
  },
  {
    id: "WC-4809",
    customer: "Robert Chen",
    phone: "845-555-0212",
    pickupTime: "Today · 3:00 PM",
    returnDate: "Jun 14",
    items: [
      { id: "a", name: "Folding Chair — White", qty: 100 },
      { id: "b", name: "Rectangular Table 8ft", qty: 10 },
    ],
  },
  {
    id: "WC-4788",
    customer: "James Park",
    phone: "845-555-0167",
    pickupTime: "Jun 11 · 11:00 AM",
    returnDate: "Jun 15",
    items: [
      { id: "a", name: "Farm Table 8ft", qty: 4 },
      { id: "b", name: "Cross-Back Chair", qty: 32 },
    ],
  },
];

const INIT_STATUSES = {
  "WC-4821": "pending",
  "WC-4795": "awaiting_return",
  "WC-4809": "staged",
  "WC-4788": "picked_up",
};

function freshState(items) {
  const m = {};
  items.forEach((i) => (m[i.id] = { status: "pending", qty: i.qty, damaged: false }));
  return m;
}

function fullCleanState(items) {
  const m = {};
  items.forEach((i) => (m[i.id] = { status: "clean", qty: i.qty, damaged: false }));
  return m;
}

/* ── shared atoms ─────────────────────────────────────────────────── */

function StatusBar() {
  return (
    <div style={{
      height: 30, background: C.blue, display: "flex", alignItems: "center",
      justifyContent: "space-between", padding: "0 22px", color: "#fff", fontSize: 12, fontWeight: 600,
    }}>
      <span>10:45</span><span>PTR</span>
    </div>
  );
}

function NavBar() {
  const tabs = [
    { k: "home",     label: "Home",      Icon: null, emoji: "⌂" },
    { k: "routes",   label: "Routes",    Icon: null, emoji: "↝" },
    { k: "tools",    label: "Tools",     Icon: Wrench },
    { k: "willcall", label: "Will Call", Icon: Package },
    { k: "profile",  label: "Profile",   Icon: User },
  ];
  return (
    <div style={{
      position: "absolute", left: 0, right: 0, bottom: 0,
      borderTop: `1px solid ${C.line}`, background: "#fff", display: "flex", height: 58,
    }}>
      {tabs.map(({ k, label, Icon, emoji }) => {
        const active = k === "willcall";
        return (
          <div key={k} style={{
            flex: 1, display: "flex", flexDirection: "column", alignItems: "center",
            justifyContent: "center", gap: 2, fontSize: 10,
            fontWeight: active ? 700 : 500, color: active ? C.blue : C.sub,
          }}>
            {Icon
              ? <Icon size={18} strokeWidth={active ? 2.2 : 1.8} />
              : <span style={{ fontSize: 17 }}>{emoji}</span>}
            {label}
            {active && <div style={{ width: 4, height: 4, borderRadius: 999, background: C.blue }} />}
          </div>
        );
      })}
    </div>
  );
}

function StatePill({ status }) {
  const cfg = {
    pending:        { label: "Needs Staging",      bg: "#f3f4f6",   color: C.sub   },
    staged:         { label: "Staged — Ready",     bg: "#eff0ff",   color: C.blue  },
    picked_up:      { label: "Out w/ Customer",    bg: C.amberTint, color: C.amber },
    awaiting_return:{ label: "Return Overdue",     bg: C.redTint,   color: C.red   },
    returned:       { label: "Returned ✓",         bg: C.greenTint, color: C.green },
  }[status] || { label: status, bg: "#f3f4f6", color: C.sub };
  return (
    <span style={{
      padding: "3px 9px", borderRadius: 999,
      background: cfg.bg, color: cfg.color, fontSize: 11, fontWeight: 700,
    }}>{cfg.label}</span>
  );
}

function Row({ icon, children }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 9, padding: "4px 0", fontSize: 13, lineHeight: 1.4 }}>
      <span style={{ marginTop: 1, flexShrink: 0 }}>{icon}</span>
      <span>{children}</span>
    </div>
  );
}

const stepBtn = {
  width: 34, height: 34, borderRadius: 10,
  border: `1.5px solid ${C.line}`, background: "#fff",
  cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
};

/* ── progress steps ───────────────────────────────────────────────── */

function ProgressSteps({ status }) {
  const steps = ["Pending", "Staged", "Picked Up", "Returned"];
  const idx = { pending: 0, staged: 1, picked_up: 2, awaiting_return: 2, returned: 3 }[status] ?? 0;
  return (
    <div style={{ background: C.card, padding: "14px 18px 10px", borderBottom: `1px solid ${C.line}` }}>
      <div style={{ display: "flex", alignItems: "flex-start" }}>
        {steps.map((s, i) => (
          <div key={s} style={{ display: "flex", alignItems: "flex-start", flex: i < steps.length - 1 ? 1 : 0 }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
              <div style={{
                width: 22, height: 22, borderRadius: 999, flexShrink: 0,
                background: i < idx ? C.green
                  : i === idx ? (status === "awaiting_return" && i === 2 ? C.red : C.blue)
                  : "#e5e7eb",
                color: "#fff", display: "flex", alignItems: "center",
                justifyContent: "center", fontSize: 11, fontWeight: 800,
              }}>
                {i < idx ? <Check size={13} strokeWidth={3} /> : i + 1}
              </div>
              <div style={{
                fontSize: 10, fontWeight: i === idx ? 700 : 400, textAlign: "center", marginTop: 3,
                color: i === idx ? (status === "awaiting_return" && i === 2 ? C.red : C.blue)
                  : i < idx ? C.green : C.sub,
              }}>{s}</div>
            </div>
            {i < steps.length - 1 && (
              <div style={{
                flex: 1, height: 2, background: i < idx ? C.green : "#e5e7eb",
                margin: "10px 4px 0",
              }} />
            )}
          </div>
        ))}
      </div>
      {status === "awaiting_return" && (
        <div style={{
          marginTop: 8, background: C.redTint, borderRadius: 8,
          padding: "6px 10px", fontSize: 12, color: C.red, fontWeight: 700,
        }}>⚠ Return overdue — contact customer</div>
      )}
    </div>
  );
}

/* ── LIST SCREEN ──────────────────────────────────────────────────── */

function ListScreen({ statuses, onSelect }) {
  const action   = ORDERS.filter((o) => statuses[o.id] === "pending" || statuses[o.id] === "awaiting_return");
  const staged   = ORDERS.filter((o) => statuses[o.id] === "staged");
  const out      = ORDERS.filter((o) => statuses[o.id] === "picked_up");
  const done     = ORDERS.filter((o) => statuses[o.id] === "returned");

  const Card = ({ order }) => {
    const st = statuses[order.id];
    const isOverdue = st === "awaiting_return";
    const isStaged  = st === "staged";
    return (
      <div onClick={() => onSelect(order.id)} style={{
        background: C.card, borderRadius: 14, marginBottom: 10, cursor: "pointer",
        border: `1.5px solid ${isOverdue ? C.red : isStaged ? C.blue : C.line}`,
        display: "flex", alignItems: "center", gap: 10, padding: "12px 14px",
      }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
            <span style={{ fontSize: 15, fontWeight: 800 }}>{order.customer}</span>
            <StatePill status={st} />
          </div>
          <div style={{ fontSize: 12, color: C.sub }}>{order.id} · {order.items.length} items</div>
          <div style={{ fontSize: 12, marginTop: 3 }}>
            {isOverdue  && <span style={{ color: C.red,   fontWeight: 700 }}>↩ Return due: {order.returnDate}</span>}
            {isStaged   && <span style={{ color: C.blue,  fontWeight: 700 }}>Pickup: {order.pickupTime}</span>}
            {st === "pending"   && <span style={{ color: C.sub }}>Pickup: {order.pickupTime}</span>}
            {st === "picked_up" && <span style={{ color: C.sub }}>Returns: {order.returnDate}</span>}
            {st === "returned"  && <span style={{ color: C.green, fontWeight: 600 }}>Complete ✓</span>}
          </div>
        </div>
        <ChevronRight size={18} color={C.sub} />
      </div>
    );
  };

  const Section = ({ label, orders }) => orders.length === 0 ? null : (
    <>
      <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: .6, color: C.sub, marginTop: 16, marginBottom: 8 }}>{label}</div>
      {orders.map((o) => <Card key={o.id} order={o} />)}
    </>
  );

  return (
    <>
      <StatusBar />
      <div style={{ background: C.blue, padding: "12px 18px 16px", color: "#fff" }}>
        <div style={{ fontSize: 21, fontWeight: 800 }}>Will Call</div>
        <div style={{ fontSize: 13, opacity: .8, marginTop: 2 }}>
          {ORDERS.length} orders · {action.length} need action today
        </div>
      </div>
      <div style={{ padding: "6px 14px 80px" }}>
        <Section label="ACTION NEEDED" orders={action} />
        <Section label="STAGED — READY FOR PICKUP" orders={staged} />
        <Section label="OUT WITH CUSTOMERS" orders={out} />
        <Section label="COMPLETE" orders={done} />
      </div>
      <NavBar />
    </>
  );
}

/* ── DETAIL SCREEN ────────────────────────────────────────────────── */

function DetailScreen({ order, status, onBack, onStartStaging, onCustomerArrived, onStartReturn }) {
  const ctas = {
    pending:         { label: "Start Staging →",                       fn: onStartStaging,   bg: C.gold,    color: C.goldInk },
    staged:          { label: "Customer Arrived — Confirm Handoff",    fn: onCustomerArrived, bg: C.blue,   color: "#fff" },
    picked_up:       { label: "Process Return",                        fn: onStartReturn,    bg: C.ink,     color: "#fff" },
    awaiting_return: { label: "Process Return — Overdue",              fn: onStartReturn,    bg: C.red,     color: "#fff" },
  };
  const cta = ctas[status];

  return (
    <>
      <StatusBar />
      <div style={{ background: C.blue, color: "#fff", padding: "10px 18px 16px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
          <button onClick={onBack} style={{ background: "none", border: "none", cursor: "pointer", color: "#fff", padding: 0, display: "flex" }}>
            <ChevronLeft size={22} />
          </button>
          <span style={{ fontSize: 13, opacity: .75 }}>{order.id}</span>
        </div>
        <div style={{ fontSize: 22, fontWeight: 800 }}>{order.customer}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 4, fontSize: 13, opacity: .85 }}>
          <Phone size={12} /> {order.phone}
        </div>
      </div>

      <ProgressSteps status={status} />

      <div style={{
        background: C.card, padding: "12px 18px", borderBottom: `1px solid ${C.line}`,
        display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8,
      }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 800, color: C.sub, marginBottom: 2 }}>PICKUP</div>
          <div style={{ fontSize: 13, fontWeight: 700 }}>{order.pickupTime}</div>
        </div>
        <div>
          <div style={{ fontSize: 10, fontWeight: 800, color: C.sub, marginBottom: 2 }}>RETURN BY</div>
          <div style={{ fontSize: 13, fontWeight: 700, color: status === "awaiting_return" ? C.red : C.ink }}>
            {order.returnDate}
          </div>
        </div>
      </div>

      <div style={{ padding: "14px 18px 100px" }}>
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: .5, color: C.sub, marginBottom: 10 }}>
          ITEMS ({order.items.length})
        </div>
        {order.items.map((it) => (
          <div key={it.id} style={{
            display: "flex", justifyContent: "space-between", alignItems: "center",
            padding: "10px 0", borderBottom: `1px solid ${C.line}`,
          }}>
            <span style={{ fontSize: 14, fontWeight: 600 }}>{it.name}</span>
            <span style={{ fontSize: 13, fontWeight: 800, background: "#f3f4f6", padding: "3px 10px", borderRadius: 999 }}>
              ×{it.qty}
            </span>
          </div>
        ))}
      </div>

      {cta && (
        <div style={{
          position: "absolute", left: 0, right: 0, bottom: 0, padding: "14px 16px 18px",
          background: `linear-gradient(180deg, rgba(246,244,239,0) 0%, ${C.page} 32%)`,
        }}>
          <button onClick={cta.fn} style={{
            width: "100%", border: "none", cursor: "pointer",
            background: cta.bg, color: cta.color,
            fontWeight: 800, fontSize: 15, padding: "15px", borderRadius: 16,
          }}>
            {cta.label}
          </button>
        </div>
      )}
      {status === "returned" && (
        <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, padding: "14px 16px 18px" }}>
          <div style={{
            background: C.greenTint, borderRadius: 14, padding: 14,
            textAlign: "center", color: C.green, fontWeight: 700, fontSize: 14,
          }}>
            <CheckCircle2 size={20} style={{ display: "block", margin: "0 auto 4px" }} />
            Order complete — all items returned ✓
          </div>
        </div>
      )}
    </>
  );
}

/* ── CHECKOFF SCREEN (staging + return) ───────────────────────────── */

function CheckoffScreen({ order, flowType, checkState, openFlag, setOpenFlag, onAccept, onConfirmAll, onQtyChange, onDamage, onComplete, onBack }) {
  const items    = order.items;
  const isStaging = flowType === "staging";
  const resolved = items.filter((i) => checkState[i.id]?.status !== "pending").length;
  const allDone  = resolved === items.length;
  const shorts   = items.filter((i) => (checkState[i.id]?.qty ?? i.qty) < i.qty);
  const damaged  = items.filter((i) => checkState[i.id]?.damaged);

  return (
    <>
      <StatusBar />
      <div style={{ background: C.blue, color: "#fff", padding: "10px 18px 18px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <button onClick={onBack} style={{ background: "none", border: "none", cursor: "pointer", color: "#fff", padding: 0, display: "flex" }}>
            <ChevronLeft size={22} />
          </button>
        </div>
        <div style={{ fontSize: 19, fontWeight: 800 }}>{order.customer}</div>
        <div style={{ fontSize: 13, opacity: .8 }}>
          {isStaging ? "Staging items" : "Processing return"} · {order.id}
        </div>
      </div>

      <div style={{ padding: "14px 14px 130px" }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 10 }}>
          <span style={{ fontSize: 14, fontWeight: 800 }}>
            {isStaging ? "Pull each item from the shelf" : "Check items back in"}
          </span>
          <span style={{ fontSize: 13, fontWeight: 700, color: allDone ? C.green : C.sub }}>
            {resolved} of {items.length}
          </span>
        </div>

        <button onClick={() => onConfirmAll(items)} style={{
          width: "100%", border: "none", cursor: "pointer", background: C.gold, color: C.goldInk,
          fontWeight: 800, fontSize: 14, padding: "12px", borderRadius: 13, marginBottom: 12,
          display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
        }}>
          <Check size={17} strokeWidth={3} />
          {isStaging ? "All items found — mark all pulled" : "All items back — no issues"}
        </button>

        {items.map((it) => {
          const st      = checkState[it.id] || { status: "pending", qty: it.qty, damaged: false };
          const short   = st.qty < it.qty;
          const flagOpen = openFlag === it.id;
          const tint    = st.status === "exception"
            ? (st.damaged && !short ? C.redTint : C.amberTint)
            : st.status === "clean" ? C.greenTint : C.card;
          const bd      = st.status === "exception"
            ? (st.damaged && !short ? C.red : C.amber)
            : st.status === "clean" ? C.green : C.line;

          return (
            <div key={it.id} style={{ background: tint, border: `1.5px solid ${bd}`, borderRadius: 14, marginBottom: 10, overflow: "hidden" }}>
              <div style={{ display: "flex", alignItems: "center", padding: "12px 12px 12px 14px", gap: 12 }}>
                <button onClick={() => onAccept(it.id, items)} style={{
                  flexShrink: 0, width: 30, height: 30, borderRadius: 999, cursor: "pointer",
                  border: st.status === "pending" ? `2px solid ${C.line}` : "none",
                  background: st.status === "clean" ? C.green
                    : st.status === "exception" && !short ? C.green
                    : st.status === "exception" && short ? C.amber : C.card,
                  display: "flex", alignItems: "center", justifyContent: "center", color: "#fff",
                }}>
                  {(st.status === "clean" || (st.status === "exception" && !short)) && <Check size={17} strokeWidth={3} />}
                  {st.status === "exception" && short && <span style={{ fontWeight: 800, fontSize: 12 }}>{st.qty}</span>}
                </button>
                <div style={{ flex: 1 }} onClick={() => onAccept(it.id, items)}>
                  <div style={{ fontWeight: 700, fontSize: 14.5 }}>{it.name}</div>
                  <div style={{ fontSize: 12, color: C.sub, display: "flex", gap: 6, marginTop: 2 }}>
                    <span>×{it.qty}</span>
                    {short && <span style={{ color: C.amber, fontWeight: 700 }}>· {st.qty} {isStaging ? "found" : "back"}</span>}
                    {st.damaged && <span style={{ color: C.red, fontWeight: 700 }}>· damaged</span>}
                  </div>
                </div>
                <button onClick={() => setOpenFlag(flagOpen ? null : it.id)} style={{
                  border: "none", cursor: "pointer",
                  background: flagOpen ? C.ink : "transparent",
                  color: flagOpen ? "#fff" : C.sub,
                  borderRadius: 9, padding: "6px 9px", fontSize: 12, fontWeight: 700,
                  display: "inline-flex", alignItems: "center", gap: 4,
                }}>
                  {flagOpen ? <X size={14} /> : <AlertTriangle size={14} />}
                  {flagOpen ? "" : "Issue"}
                </button>
              </div>

              {flagOpen && (
                <div style={{ borderTop: `1px solid ${bd}`, padding: 12, background: "rgba(255,255,255,.55)" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 13 }}>{isStaging ? "Qty found" : "Qty returned"}</div>
                      <div style={{ fontSize: 11, color: C.sub }}>{short ? `${it.qty - st.qty} short` : "Full qty"}</div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <button onClick={() => onQtyChange(it.id, -1, items)} style={stepBtn}><Minus size={15} /></button>
                      <span style={{ fontWeight: 800, fontSize: 16, minWidth: 30, textAlign: "center" }}>{st.qty}</span>
                      <button onClick={() => onQtyChange(it.id, +1, items)} style={stepBtn}><Plus size={15} /></button>
                    </div>
                  </div>
                  {!isStaging && (
                    <button onClick={() => onDamage(it.id, items)} style={{
                      width: "100%", border: `1.5px solid ${st.damaged ? C.red : C.line}`,
                      cursor: "pointer", background: st.damaged ? C.redTint : C.card,
                      borderRadius: 11, padding: "10px 12px",
                      display: "flex", alignItems: "center", gap: 10, marginBottom: 10,
                    }}>
                      <span style={{
                        width: 22, height: 22, borderRadius: 6, flexShrink: 0,
                        border: st.damaged ? "none" : `2px solid ${C.line}`,
                        background: st.damaged ? C.red : C.card,
                        display: "flex", alignItems: "center", justifyContent: "center", color: "#fff",
                      }}>
                        {st.damaged && <Check size={14} strokeWidth={3} />}
                      </span>
                      <span style={{ flex: 1 }}>
                        <span style={{ fontWeight: 700, fontSize: 13, display: "block" }}>Returned damaged</span>
                        <span style={{ fontSize: 11, color: C.sub }}>Opens a repair work order</span>
                      </span>
                      <Wrench size={15} color={st.damaged ? C.red : C.sub} />
                    </button>
                  )}
                  <button onClick={() => setOpenFlag(null)} style={{
                    width: "100%", border: "none", cursor: "pointer",
                    background: C.ink, color: "#fff", fontWeight: 800, fontSize: 13, padding: "10px", borderRadius: 10,
                  }}>Done</button>
                </div>
              )}
            </div>
          );
        })}

        {(shorts.length > 0 || damaged.length > 0) && (
          <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 14, padding: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: C.sub, letterSpacing: .5, marginBottom: 8 }}>ON CONFIRM</div>
            {shorts.length > 0 && (
              <Row icon={<AlertTriangle size={14} color={C.amber} />}>
                <b>{shorts.length} short</b> — note sent to Melissa
              </Row>
            )}
            {damaged.length > 0 && (
              <Row icon={<Wrench size={14} color={C.red} />}>
                <b>{damaged.length} work order{damaged.length > 1 ? "s" : ""}</b> created for damage
              </Row>
            )}
          </div>
        )}
      </div>

      <div style={{
        position: "absolute", left: 0, right: 0, bottom: 0, padding: "14px 16px 18px",
        background: `linear-gradient(180deg, rgba(246,244,239,0) 0%, ${C.page} 32%)`,
      }}>
        <button disabled={!allDone} onClick={onComplete} style={{
          width: "100%", border: "none",
          cursor: allDone ? "pointer" : "not-allowed",
          background: allDone ? C.blue : "#d6d4ce",
          color: allDone ? "#fff" : "#9b9890",
          fontWeight: 800, fontSize: 16, padding: "15px", borderRadius: 16,
          boxShadow: allDone ? "0 4px 14px rgba(10,20,255,.32)" : "none",
        }}>
          {allDone
            ? (isStaging ? "Confirm Staging Complete" : "Complete Return")
            : `Confirm all first · ${resolved} of ${items.length}`}
        </button>
      </div>
    </>
  );
}

/* ── PICKUP CONFIRM SCREEN ────────────────────────────────────────── */

function PickupConfirmScreen({ order, checkState, onConfirm, onBack }) {
  const shorts = order.items.filter((i) => {
    const s = checkState[i.id];
    return s && s.qty < i.qty;
  });

  return (
    <>
      <StatusBar />
      <div style={{ background: C.blue, color: "#fff", padding: "10px 18px 16px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <button onClick={onBack} style={{ background: "none", border: "none", cursor: "pointer", color: "#fff", padding: 0, display: "flex" }}>
            <ChevronLeft size={22} />
          </button>
          <span style={{ fontSize: 13, opacity: .75 }}>Confirm Handoff</span>
        </div>
        <div style={{ fontSize: 22, fontWeight: 800 }}>{order.customer}</div>
        <div style={{ fontSize: 13, opacity: .8 }}>{order.id} · All items staged ✓</div>
      </div>

      <div style={{ padding: "16px 18px 110px" }}>
        <div style={{ background: C.card, border: `2px solid ${C.blue}`, borderRadius: 14, padding: 14, marginBottom: 14 }}>
          <div style={{ fontSize: 10, fontWeight: 800, color: C.blue, letterSpacing: .5, marginBottom: 6 }}>VERIFY CUSTOMER IDENTITY</div>
          <div style={{ fontSize: 17, fontWeight: 800 }}>{order.customer}</div>
          <div style={{ fontSize: 13, color: C.sub, marginTop: 2, display: "flex", alignItems: "center", gap: 5 }}>
            <Phone size={12} /> {order.phone}
          </div>
        </div>

        <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 14, padding: 14, marginBottom: 14 }}>
          <div style={{ fontSize: 10, fontWeight: 800, color: C.sub, letterSpacing: .5, marginBottom: 10 }}>GOING WITH CUSTOMER</div>
          {order.items.map((it) => {
            const actualQty = checkState[it.id]?.qty ?? it.qty;
            const short     = actualQty < it.qty;
            return (
              <div key={it.id} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: `1px solid ${C.line}` }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>{it.name}</span>
                <span style={{ fontSize: 13, fontWeight: 800, color: short ? C.amber : C.ink }}>
                  ×{actualQty}{short ? ` (${it.qty - actualQty} short)` : ""}
                </span>
              </div>
            );
          })}
        </div>

        <div style={{ background: C.greenTint, border: `1px solid ${C.green}30`, borderRadius: 14, padding: 14 }}>
          <div style={{ fontSize: 10, fontWeight: 800, color: C.green, letterSpacing: .5, marginBottom: 4 }}>RETURN DATE</div>
          <div style={{ fontSize: 16, fontWeight: 800 }}>{order.returnDate}</div>
          {shorts.length > 0 && (
            <div style={{ fontSize: 12, color: C.amber, fontWeight: 600, marginTop: 8 }}>
              ⚠ {shorts.length} item{shorts.length > 1 ? "s" : ""} short — note to Melissa
            </div>
          )}
        </div>
      </div>

      <div style={{
        position: "absolute", left: 0, right: 0, bottom: 0, padding: "14px 16px 18px",
        background: `linear-gradient(180deg, rgba(246,244,239,0) 0%, ${C.page} 32%)`,
      }}>
        <button onClick={onConfirm} style={{
          width: "100%", border: "none", cursor: "pointer",
          background: C.blue, color: "#fff",
          fontWeight: 800, fontSize: 15, padding: "15px", borderRadius: 16,
          boxShadow: "0 4px 14px rgba(10,20,255,.28)",
        }}>
          Confirm Handoff — {order.customer.split(" ")[0]} picks up now
        </button>
        <div style={{ textAlign: "center", fontSize: 11, color: C.sub, marginTop: 8 }}>
          Order moves to "Out with Customer" after this
        </div>
      </div>
    </>
  );
}

/* ── RETURN DONE SCREEN ───────────────────────────────────────────── */

function ReturnDoneScreen({ order, checkState, onDone }) {
  const shorts  = order.items.filter((i) => (checkState[i.id]?.qty ?? i.qty) < i.qty);
  const damaged = order.items.filter((i) => checkState[i.id]?.damaged);

  return (
    <>
      <StatusBar />
      <div style={{ padding: "28px 20px 20px" }}>
        <div style={{ textAlign: "center", marginBottom: 18 }}>
          <CheckCircle2 size={52} color={C.green} style={{ display: "block", margin: "0 auto 10px" }} />
          <div style={{ fontSize: 22, fontWeight: 800 }}>Return Complete</div>
          <div style={{ fontSize: 14, color: C.sub, marginTop: 2 }}>{order.customer} · {order.id}</div>
        </div>
        <div style={{ background: C.page, borderRadius: 14, padding: 14, marginBottom: 16 }}>
          <Row icon={<Package size={15} color={C.green} />}>
            <b>{order.items.length} item type{order.items.length > 1 ? "s" : ""}</b> checked back into warehouse
          </Row>
          {shorts.length > 0 && (
            <Row icon={<AlertTriangle size={15} color={C.amber} />}>
              <b>{shorts.length} short</b> — discrepancy note sent to Melissa
            </Row>
          )}
          {damaged.length > 0 && (
            <Row icon={<Wrench size={15} color={C.red} />}>
              <b>{damaged.length} work order{damaged.length > 1 ? "s" : ""}</b> opened for damage
            </Row>
          )}
          {shorts.length === 0 && damaged.length === 0 && (
            <Row icon={<Check size={15} color={C.green} />}>
              All items back in good condition — no issues
            </Row>
          )}
        </div>
        <button onClick={onDone} style={{
          width: "100%", border: "none", cursor: "pointer",
          background: C.ink, color: "#fff",
          fontWeight: 800, fontSize: 15, padding: "14px", borderRadius: 14,
        }}>
          Back to Will Call
        </button>
      </div>
    </>
  );
}

/* ── ROOT ─────────────────────────────────────────────────────────── */

export default function WillCallMockup() {
  const [screen,     setScreen]     = useState("list");
  const [selectedId, setSelectedId] = useState(null);
  const [statuses,   setStatuses]   = useState({ ...INIT_STATUSES });
  const [checkState, setCheckState] = useState({});
  const [openFlag,   setOpenFlag]   = useState(null);
  const [flowType,   setFlowType]   = useState(null);

  const order = ORDERS.find((o) => o.id === selectedId);

  const goDetail = (id) => { setSelectedId(id); setScreen("detail"); };
  const goList   = ()   => setScreen("list");

  const startFlow = (type) => {
    setFlowType(type);
    setCheckState(freshState(order.items));
    setOpenFlag(null);
    setScreen("checkoff");
  };

  const customerArrived = () => {
    setCheckState(fullCleanState(order.items));
    setScreen("pickup_confirm");
  };

  const completeCheckoff = () => {
    if (flowType === "staging") {
      setStatuses((s) => ({ ...s, [selectedId]: "staged" }));
      setScreen("pickup_confirm");
    } else {
      setStatuses((s) => ({ ...s, [selectedId]: "returned" }));
      setScreen("return_done");
    }
  };

  const confirmPickup = () => {
    setStatuses((s) => ({ ...s, [selectedId]: "picked_up" }));
    setScreen("detail");
  };

  const acceptClean = (id, items) => {
    const cur = checkState[id] || {};
    if (cur.status === "clean") {
      setCheckState((s) => ({ ...s, [id]: { ...s[id], status: "pending" } }));
    } else {
      const it = items.find((x) => x.id === id);
      setCheckState((s) => ({ ...s, [id]: { status: "clean", qty: it.qty, damaged: false } }));
      if (openFlag === id) setOpenFlag(null);
    }
  };

  const confirmAll = (items) => {
    const n = {};
    items.forEach((it) => { n[it.id] = { status: "clean", qty: it.qty, damaged: false }; });
    setCheckState(n);
    setOpenFlag(null);
  };

  const changeQty = (id, delta, items) => {
    const it = items.find((x) => x.id === id);
    setCheckState((s) => {
      const cur = s[id] || { qty: it.qty, damaged: false };
      const q   = Math.max(0, Math.min(it.qty, cur.qty + delta));
      const ex  = q < it.qty || cur.damaged;
      return { ...s, [id]: { ...cur, qty: q, status: ex ? "exception" : "clean" } };
    });
  };

  const toggleDamage = (id, items) => {
    setCheckState((s) => {
      const cur = s[id] || {};
      const d   = !cur.damaged;
      const it  = items.find((x) => x.id === id);
      const ex  = d || (cur.qty ?? it.qty) < it.qty;
      return { ...s, [id]: { ...cur, damaged: d, status: ex ? "exception" : "clean" } };
    });
  };

  return (
    <div style={{ fontFamily: FONT, background: "#e7e4dc", minHeight: "100%", padding: "20px 0 40px", color: C.ink }}>
      <div style={{
        width: 390, margin: "0 auto", background: C.page, borderRadius: 38,
        boxShadow: "0 18px 50px rgba(0,0,0,.28)", overflow: "hidden",
        border: "10px solid #0c0c10", position: "relative", minHeight: 760,
      }}>
        {screen === "list" && (
          <ListScreen statuses={statuses} onSelect={goDetail} />
        )}
        {screen === "detail" && order && (
          <DetailScreen
            order={order}
            status={statuses[selectedId]}
            onBack={goList}
            onStartStaging={() => startFlow("staging")}
            onCustomerArrived={customerArrived}
            onStartReturn={() => startFlow("return")}
          />
        )}
        {screen === "checkoff" && order && (
          <CheckoffScreen
            order={order}
            flowType={flowType}
            checkState={checkState}
            openFlag={openFlag}
            setOpenFlag={setOpenFlag}
            onAccept={acceptClean}
            onConfirmAll={confirmAll}
            onQtyChange={changeQty}
            onDamage={toggleDamage}
            onComplete={completeCheckoff}
            onBack={() => setScreen("detail")}
          />
        )}
        {screen === "pickup_confirm" && order && (
          <PickupConfirmScreen
            order={order}
            checkState={checkState}
            onConfirm={confirmPickup}
            onBack={() => setScreen("detail")}
          />
        )}
        {screen === "return_done" && order && (
          <ReturnDoneScreen
            order={order}
            checkState={checkState}
            onDone={goList}
          />
        )}
      </div>
      <p style={{
        textAlign: "center", color: "#7a776f", fontSize: 12, marginTop: 16,
        maxWidth: 390, marginLeft: "auto", marginRight: "auto", lineHeight: 1.6,
      }}>
        <b>Sandra Bell</b> (pending) → full staging + handoff flow.&nbsp;
        <b>Maria Torres</b> (return overdue) → return processing flow.&nbsp;
        <b>Robert Chen</b> is staged and waiting.&nbsp;
        <b>James Park</b> is out with customer.
      </p>
    </div>
  );
}
