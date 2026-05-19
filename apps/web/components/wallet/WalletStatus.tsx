import { walletStatusLabel, type WalletView } from "../../lib/wallet";

export function WalletStatus(props: WalletView) {
  return <span className="badge warn">{walletStatusLabel(props)}</span>;
}
