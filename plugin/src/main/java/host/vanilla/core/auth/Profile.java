package host.vanilla.core.auth;

import java.util.HashSet;
import java.util.Set;

/** Что плагин знает об игроке, пока тот онлайн. Обновляется из API. */
public final class Profile {

    public enum State { AWAITING_LOGIN, AWAITING_2FA, AUTHENTICATED }

    private State state = State.AWAITING_LOGIN;
    private int adminLevel;
    private int level;
    private int balanceVc;
    private int failedAttempts;
    private final Set<String> cosmetics = new HashSet<>();
    private final long joinedAt = System.currentTimeMillis();

    public State state() { return state; }
    public void setState(State state) { this.state = state; }

    public boolean authenticated() { return state == State.AUTHENTICATED; }

    public int adminLevel() { return adminLevel; }
    public void setAdminLevel(int adminLevel) { this.adminLevel = adminLevel; }

    public int level() { return level; }
    public void setLevel(int level) { this.level = level; }

    public int balanceVc() { return balanceVc; }
    public void setBalanceVc(int balanceVc) { this.balanceVc = balanceVc; }

    public Set<String> cosmetics() { return cosmetics; }

    public int failedAttempts() { return failedAttempts; }
    public int registerFailure() { return ++failedAttempts; }

    public long joinedAt() { return joinedAt; }
}
