export default function CreatoraBackground() {
  return (
    <div className="creatora-background" aria-hidden="true">
      <svg
        className="creatora-background__art"
        viewBox="0 0 1440 900"
        preserveAspectRatio="xMidYMid slice"
        focusable="false"
      >
        <defs>
          <radialGradient id="creatora-coral-haze" cx="78%" cy="24%" r="72%">
            <stop offset="0%" stopColor="#ff5733" stopOpacity=".34" />
            <stop offset="38%" stopColor="#ff7a3d" stopOpacity=".16" />
            <stop offset="100%" stopColor="#09090b" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="creatora-pink-haze" cx="12%" cy="70%" r="60%">
            <stop offset="0%" stopColor="#e85d75" stopOpacity=".2" />
            <stop offset="55%" stopColor="#e74732" stopOpacity=".08" />
            <stop offset="100%" stopColor="#09090b" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="creatora-ribbon-gradient" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="1440" y2="0">
            <stop offset="0%" stopColor="#e74732" stopOpacity="0" />
            <stop offset="18%" stopColor="#e74732" stopOpacity=".4" />
            <stop offset="35%" stopColor="#ff5733" stopOpacity=".82" />
            <stop offset="53%" stopColor="#ff8a45" stopOpacity=".94" />
            <stop offset="70%" stopColor="#ff704d" stopOpacity=".84" />
            <stop offset="86%" stopColor="#e85d75" stopOpacity=".62" />
            <stop offset="100%" stopColor="#e74732" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="creatora-ribbon-edge" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="1440" y2="0">
            <stop offset="0%" stopColor="#ff704d" stopOpacity="0" />
            <stop offset="36%" stopColor="#ff8a45" stopOpacity=".64" />
            <stop offset="56%" stopColor="#ffd0a1" stopOpacity=".96" />
            <stop offset="74%" stopColor="#ff704d" stopOpacity=".82" />
            <stop offset="90%" stopColor="#e85d75" stopOpacity=".58" />
            <stop offset="100%" stopColor="#e85d75" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="creatora-lower-ribbon-gradient" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="1440" y2="0">
            <stop offset="0%" stopColor="#e74732" stopOpacity="0" />
            <stop offset="20%" stopColor="#ff5733" stopOpacity=".5" />
            <stop offset="43%" stopColor="#ff8a45" stopOpacity=".7" />
            <stop offset="64%" stopColor="#e74732" stopOpacity=".56" />
            <stop offset="82%" stopColor="#e85d75" stopOpacity=".4" />
            <stop offset="100%" stopColor="#e74732" stopOpacity="0" />
          </linearGradient>
          <filter id="creatora-ribbon-atmosphere" filterUnits="userSpaceOnUse" x="-240" y="-260" width="1920" height="1420">
            <feGaussianBlur stdDeviation="38" />
          </filter>
          <filter id="creatora-ribbon-soft-glow" filterUnits="userSpaceOnUse" x="-180" y="-200" width="1800" height="1300">
            <feGaussianBlur stdDeviation="13" />
          </filter>
          <filter id="creatora-ribbon-edge-glow" filterUnits="userSpaceOnUse" x="-160" y="-180" width="1760" height="1260">
            <feGaussianBlur stdDeviation="4" />
          </filter>
        </defs>
        <g className="creatora-background__haze">
          <rect width="1440" height="900" fill="url(#creatora-coral-haze)" />
          <rect width="1440" height="900" fill="url(#creatora-pink-haze)" />
        </g>
        <g className="creatora-background__ribbons">
          <path
            d="M410 -100 C555 -7 668 140 831 127 C1004 113 1091 34 1210 52 C1328 70 1396 135 1510 82 L1510 243 C1389 296 1307 218 1190 188 C1049 151 956 253 800 273 C636 294 526 167 410 87 Z"
            fill="url(#creatora-ribbon-gradient)"
            opacity=".72"
            filter="url(#creatora-ribbon-atmosphere)"
          />
          <path
            d="M410 -100 C555 -7 668 140 831 127 C1004 113 1091 34 1210 52 C1328 70 1396 135 1510 82 L1510 243 C1389 296 1307 218 1190 188 C1049 151 956 253 800 273 C636 294 526 167 410 87 Z"
            fill="url(#creatora-ribbon-gradient)"
            opacity=".68"
          />
          <path
            d="M432 -24 C571 55 681 174 834 164 C1003 154 1092 78 1206 91 C1321 105 1393 172 1509 125"
            fill="none"
            stroke="url(#creatora-ribbon-edge)"
            strokeWidth="3.5"
            strokeLinecap="round"
            opacity=".78"
            filter="url(#creatora-ribbon-edge-glow)"
          />
          <path
            d="M-130 492 C55 414 194 515 330 638 C473 768 604 808 754 729 C910 647 1000 535 1144 552 C1289 570 1384 682 1538 641 L1538 802 C1380 855 1275 766 1125 723 C980 682 887 835 726 874 C550 916 401 792 264 676 C116 550 7 555 -130 633 Z"
            fill="url(#creatora-lower-ribbon-gradient)"
            opacity=".4"
            filter="url(#creatora-ribbon-atmosphere)"
          />
          <path
            d="M-130 492 C55 414 194 515 330 638 C473 768 604 808 754 729 C910 647 1000 535 1144 552 C1289 570 1384 682 1538 641 L1538 802 C1380 855 1275 766 1125 723 C980 682 887 835 726 874 C550 916 401 792 264 676 C116 550 7 555 -130 633 Z"
            fill="url(#creatora-lower-ribbon-gradient)"
            opacity=".34"
          />
          <path
            d="M-92 543 C66 477 201 570 334 687 C474 809 608 846 755 773 C904 699 1000 587 1142 604 C1280 621 1381 729 1526 696"
            fill="none"
            stroke="url(#creatora-ribbon-edge)"
            strokeWidth="2.5"
            strokeLinecap="round"
            opacity=".46"
            filter="url(#creatora-ribbon-edge-glow)"
          />
        </g>
      </svg>
    </div>
  );
}
