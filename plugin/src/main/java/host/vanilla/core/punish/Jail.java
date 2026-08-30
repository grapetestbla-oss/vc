package host.vanilla.core.punish;

import org.bukkit.Location;

/** Активная отсидка конкретного игрока. */
public final class Jail {

    private final String id;
    private final String reason;
    private final int totalSeconds;
    private int remainingSeconds;
    private int blocksMined;
    /// Сколько реальных секунд накопилось с прошлого списания секунды срока.
    private int realSeconds;
    private Location returnLocation;
    private String inventoryData;
    private long lastSyncAt = System.currentTimeMillis();

    public Jail(String id, String reason, int totalSeconds, int remainingSeconds, int blocksMined) {
        this.id = id;
        this.reason = reason;
        this.totalSeconds = totalSeconds;
        this.remainingSeconds = remainingSeconds;
        this.blocksMined = blocksMined;
    }

    public String id() { return id; }
    public String reason() { return reason; }
    public int totalSeconds() { return totalSeconds; }
    public int remainingSeconds() { return remainingSeconds; }
    public int blocksMined() { return blocksMined; }
    public Location returnLocation() { return returnLocation; }
    public String inventoryData() { return inventoryData; }
    public long lastSyncAt() { return lastSyncAt; }

    public void setReturnLocation(Location location) { this.returnLocation = location; }
    public void setInventoryData(String data) { this.inventoryData = data; }
    public void markSynced() { this.lastSyncAt = System.currentTimeMillis(); }

    /**
     * Секунда реального времени. Срок идёт медленно: минута заключения стоит
     * realPerServing реальных минут, поэтому просто отсидеться дорого —
     * быстрее выйти работой.
     *
     * @return true, если срок отбыт.
     */
    public boolean tick(int realPerServing) {
        if (remainingSeconds == 0) return true;
        realSeconds++;
        if (realSeconds < Math.max(1, realPerServing)) return false;

        realSeconds = 0;
        remainingSeconds = Math.max(0, remainingSeconds - 1);
        return remainingSeconds == 0;
    }

    /** Досрочное списание: наряд у прораба или добытый блок. */
    public boolean reduce(int seconds) {
        remainingSeconds = Math.max(0, remainingSeconds - Math.max(0, seconds));
        return remainingSeconds == 0;
    }

    public boolean addMinedBlock(int secondsPerBlock) {
        blocksMined++;
        return reduce(secondsPerBlock);
    }
}
