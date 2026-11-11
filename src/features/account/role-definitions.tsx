import { roleInfo, roles, type Role } from "./role";
import { RoleBadge } from "./role-badge";
import styles from "./account.module.css";

/** The fixed set of roles, lowest first. Each includes everything the ones before it can do. */
export function RoleDefinitions({ current }: { current?: Role }) {
  return (
    <div data-testid="role-definitions">
      <p className={styles.muted}>
        Every account holds exactly one role. Each role can do everything the one before it can.
        The set is fixed: changing it is a product decision, not a setting.
      </p>
      <ol className={styles.roleList}>
        {roles.map((role) => (
          <li key={role} className={styles.roleItem} data-current={role === current || undefined}>
            <div className={styles.roleHeader}>
              <RoleBadge role={role} />
              {role === current && <span className={styles.youTag}>Your role</span>}
            </div>
            <p className={styles.rolePurpose}>{roleInfo[role].purpose}</p>
            {roleInfo[role].includes && <p className={styles.roleIncludes}>{roleInfo[role].includes}</p>}
          </li>
        ))}
      </ol>
    </div>
  );
}
