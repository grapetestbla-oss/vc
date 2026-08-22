package host.vanilla.demorgan;

import org.bukkit.Location;

import java.util.UUID;

/** Одно активное наказание. Время тикает только пока игрок онлайн. */
public final class Punishment {

    private final UUID uuid;
    private final String name;
    private final String reason;
    private final String issuedBy;
    private final long issuedAt;
    private final int totalSeconds;

    private int remainingSeconds;
    private int blocksMined;
    private Location returnLocation;
    private String inventoryData;

    public Punishment(UUID uuid, String name, String reason, String issuedBy,
                      long issuedAt, int totalSeconds, int remainingSeconds,
                      int blocksMined, Location returnLocation, String inventoryData) {
        this.uuid = uuid;
        this.name = name;
        this.reason = reason;
        this.issuedBy = issuedBy;
        this.issuedAt = issuedAt;
        this.totalSeconds = totalSeconds;
        this.remainingSeconds = remainingSeconds;
        this.blocksMined = blocksMined;
        this.returnLocation = returnLocation;
        this.inventoryData = inventoryData;
    }

    public UUID uuid() { return uuid; }
    public String name() { return name; }
    public String reason() { return reason; }
    public String issuedBy() { return issuedBy; }
    public long issuedAt() { return issuedAt; }
    public int totalSeconds() { return totalSeconds; }
    public int remainingSeconds() { return remainingSeconds; }
    public int blocksMined() { return blocksMined; }
    public Location returnLocation() { return returnLocation; }
    public String inventoryData() { return inventoryData; }

    public void setReturnLocation(Location loc) { this.returnLocation = loc; }
    public void setInventoryData(String data) { this.inventoryData = data; }

    /** @return true, если срок отбыт */
    public boolean tickSecond() {
        remainingSeconds = Math.max(0, remainingSeconds - 1);
        return remainingSeconds == 0;
    }

    /** Засчитывает добытый блок. @return true, если срок отбыт досрочно */
    public boolean addMinedBlock(int secondsPerBlock) {
        blocksMined++;
        remainingSeconds = Math.max(0, remainingSeconds - secondsPerBlock);
        return remainingSeconds == 0;
    }

    public void release() { remainingSeconds = 0; }

    public double progress() {
        if (totalSeconds <= 0) return 1.0;
        return 1.0 - ((double) remainingSeconds / (double) totalSeconds);
    }
}
