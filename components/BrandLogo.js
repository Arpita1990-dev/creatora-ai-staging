import Image from "next/image";

export default function BrandLogo({ iconOnly = false, horizontal = true, priority = false, className = "" }) {
  const showWordmark = horizontal && !iconOnly;
  const useIcon = iconOnly || horizontal;
  const src = useIcon ? "/branding/creatora-icon.png" : "/branding/creatora-logo.png";
  return (
    <span className={`brand-lockup${iconOnly ? " brand-lockup--icon" : ""}${showWordmark ? " brand-lockup--horizontal" : ""}${className ? ` ${className}` : ""}`}>
      <Image
        className={useIcon ? "brand-lockup__icon" : "brand-lockup__full"}
        src={src}
        alt={showWordmark ? "" : "Creatora AI"}
        width={useIcon ? 772 : 1074}
        height={useIcon ? 732 : 925}
        priority={priority}
      />
      {showWordmark && <span className="brand-lockup__wordmark">Creatora <b>AI</b></span>}
    </span>
  );
}
