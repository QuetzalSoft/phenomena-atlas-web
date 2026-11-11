import { roleInfo, type Role } from "./role";
import styles from "./account.module.css";

export function RoleBadge({ role }: { role: Role }) {
  return (
    <span className={styles.roleBadge} data-role={role}>
      {roleInfo[role].label}
    </span>
  );
}
