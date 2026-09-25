"use client";

import { useMemo, useState } from "react";
import styles from "./portal.module.css";

const packages = [
  { id: "hour", name: "1 Hour", price: 500, unit: "1 hour", badge: "QUICK ACCESS" },
  { id: "day", name: "Full Day", price: 1500, unit: "24 hours", badge: "POPULAR" },
  { id: "week", name: "7 Days", price: 6000, unit: "7 days", badge: "BEST VALUE" },
  { id: "month", name: "30 Days", price: 18000, unit: "30 days", badge: "LONG STAY" },
];
const gateways = [["mpesa","M-Pesa","Vodacom"],["mixx","Mixx by Yas","Yas"],["airtel","Airtel Money","Airtel"],["halopesa","HaloPesa","Halotel"]];

export default function JaslynCustomerPortal() {
  const [selected,setSelected]=useState("day"); const [gateway,setGateway]=useState("mpesa"); const [voucher,setVoucher]=useState(""); const [notice,setNotice]=useState("");
  const plan=useMemo(()=>packages.find((item)=>item.id===selected),[selected]);
  function startPayment(){setNotice("Payment is not configured yet. Connect an authoritative gateway in Jaslyn Net before any transaction can be marked paid.");}
  function redeemVoucher(e){e.preventDefault();setNotice(voucher.trim()?"Voucher verification is waiting for a connected voucher service.":"Enter a voucher code first.");}
  return <main className={styles.page}>
    <div className={styles.noise}/>
    <header className={styles.header}><a href="/" className={styles.logo}><span className={styles.logoMark}>J</span><span>JASLYN <b>NET</b></span></a><div className={styles.headerRight}><span className={styles.secure}>● SECURE ACCESS PORTAL</span><a href="/login">Operator login →</a></div></header>
    <section className={styles.hero}><div className={styles.heroCopy}><span className={styles.kicker}>WIFI ACCESS • SELF SERVICE</span><h1>Get online.<br/><em>Stay connected.</em></h1><p>Choose an internet package, pay through your selected mobile-money route, or redeem a voucher. Access is granted only after the connected payment or voucher authority verifies the transaction.</p><div className={styles.trust}><span>✓ Mobile money ready</span><span>✓ Voucher access</span><span>✓ Automatic expiry</span></div></div><div className={styles.signalCard}><div className={styles.signalTop}><span>ACCESS NODE</span><b>JASLYN / PORTAL</b></div><div className={styles.radar}><i/><i/><i/><span>WIFI</span></div><div className={styles.signalBottom}><span>SESSION</span><strong>AWAITING AUTHORIZATION</strong></div></div></section>
    <section className={styles.workspace}>
      <div className={styles.packagePanel}><div className={styles.sectionHead}><div><span>01 / PACKAGE</span><h2>Choose your access</h2></div><small>TZS • TAXES/FEES IF APPLICABLE</small></div><div className={styles.packageGrid}>{packages.map(item=><button key={item.id} onClick={()=>setSelected(item.id)} className={styles.package+" "+(selected===item.id?styles.selected:"")}><span className={styles.packageBadge}>{item.badge}</span><b>{item.name}</b><strong>TZS {item.price.toLocaleString()}</strong><small>{item.unit}</small>{selected===item.id&&<i>SELECTED</i>}</button>)}</div></div>
      <div className={styles.payPanel}><div className={styles.sectionHead}><div><span>02 / PAYMENT</span><h2>Pay securely</h2></div><small>VERIFIED SERVER-SIDE</small></div><div className={styles.order}><span>{plan.name}</span><strong>TZS {plan.price.toLocaleString()}</strong></div><div className={styles.methods}>{gateways.map(([id,name,network])=><button key={id} onClick={()=>setGateway(id)} className={gateway===id?styles.methodActive:""}><span>{name}</span><small>{network}</small>{gateway===id&&<b>✓</b>}</button>)}</div><button className={styles.payButton} onClick={startPayment}>Continue with {gateways.find(([id])=>id===gateway)?.[1]} <span>→</span></button>{notice&&<div className={styles.notice} role="status">{notice}</div>}</div>
      <div className={styles.voucherPanel}><div><span>03 / VOUCHER</span><h2>Already have a code?</h2><p>Voucher activation stays independent from payment gateways.</p></div><form onSubmit={redeemVoucher}><input value={voucher} onChange={e=>setVoucher(e.target.value)} placeholder="ENTER VOUCHER CODE" aria-label="Voucher code"/><button>Redeem</button></form></div>
    </section>
    <footer className={styles.footer}><div><span className={styles.logoMark}>J</span><b>JASLYN NET</b><small>Universal connectivity operating fabric</small></div><span>Access • Billing • Identity • Network</span><span>© 2026 Jaslyn Net</span></footer>
  </main>;
}
