export default function OrbitArt() {
  return <svg className="orbit-art" viewBox="0 0 600 390" fill="none" aria-hidden="true">
    <defs>
      <linearGradient id="orbit-stroke" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#d7f7ae"/><stop offset=".48" stopColor="#89b666"/><stop offset="1" stopColor="#233220"/></linearGradient>
      <radialGradient id="orbit-glow"><stop stopColor="#81994d" stopOpacity=".17"/><stop offset="1" stopColor="#81994d" stopOpacity="0"/></radialGradient>
    </defs>
    <ellipse cx="320" cy="210" rx="265" ry="195" fill="url(#orbit-glow)"/>
    <g transform="translate(315 193) rotate(-29)">
      {Array.from({ length: 43 }, (_, i) => <ellipse key={i} rx={70 + i * 3.1} ry={126 - i * 1.8} transform={`rotate(${i * 2.4})`} stroke="url(#orbit-stroke)" strokeWidth=".65" opacity={.6 + i / 110}/>) }
      <ellipse rx="254" ry="88" stroke="#839078" strokeWidth=".55" transform="rotate(-16)"/>
      <circle cx="239" cy="-31" r="6" fill="#cfeba5"/>
    </g>
    <path d="M70 70h16m-8-8v16M509 292h16m-8-8v16" stroke="#839078" strokeWidth=".8"/>
    <path d="M70 310h92m290-240h55" stroke="#516044" strokeWidth=".6"/>
    <text x="73" y="328" fontSize="9" fill="#829073" fontFamily="monospace" letterSpacing="2">GROW YOUR OWN WAY</text>
    <text x="454" y="61" fontSize="9" fill="#829073" fontFamily="monospace">55°49′ N</text>
  </svg>
}
