package host.vanilla.core.punish;

import org.bukkit.Location;

/** Активная отсидка конкретного игрока. */
public final class Jail {

    private final String id;
    private final String reason;
    private final int totalSeconds;
    private int remainingSeconds;
    private int blocksMined;
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

    /** @return true, если срок отбыт. Время идёт с ускорением ratio. */
    public boolean tick(int ratio) {
        remainingSeconds = Math.max(0, remainingSeconds - ratio);
        return remainingSeconds == 0;
    }

    public boolean addMinedBlock(int secondsPerBlock) {
        blocksMined++;
        remainingSeconds = Math.max(0, remainingSeconds - secondsPerBlock);
        return remainingSeconds == 0;
    }
}
