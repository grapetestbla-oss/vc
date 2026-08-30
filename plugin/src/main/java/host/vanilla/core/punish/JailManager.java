package host.vanilla.core.punish;

import com.google.gson.JsonObject;
import host.vanilla.core.VanillaCorePlugin;
import host.vanilla.core.util.InventorySerializer;
import host.vanilla.core.util.LocationCodec;
import host.vanilla.core.util.Messages;
import net.kyori.adventure.text.Component;
import org.bukkit.GameMode;
import org.bukkit.Location;
import org.bukkit.entity.Player;
import org.bukkit.inventory.ItemStack;
import org.bukkit.inventory.meta.ItemMeta;

import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import java.util.logging.Level;

/**
 * Деморган. Время идёт 1 к 10 и только пока игрок онлайн; добыча породы
 * ускоряет освобождение. Состояние живёт на сайте, здесь — рабочая копия.
 */
public final class JailManager {

    private final VanillaCorePlugin plugin;
    private final JailZone zone;
    private final Messages messages;
    private final Map<UUID, Jail> jails = new HashMap<>();

    private JailJobs jobs;

    /** Наряды заводятся после менеджера, поэтому связываем их отдельно. */
    public void setJobs(JailJobs jobs) {
        this.jobs = jobs;
    }

    public JailManager(VanillaCorePlugin plugin, JailZone zone, Messages messages) {
        this.plugin = plugin;
        this.zone = zone;
        this.messages = messages;
    }

    public boolean isJailed(Player player) {
        return jails.containsKey(player.getUniqueId());
    }

    public Jail jailOf(Player player) {
        return jails.get(player.getUniqueId());
    }

    /** Применяет отсидку, приехавшую из профиля при входе. */
    public void restore(Player player, JsonObject data) {
        Jail jail = new Jail(
                data.get("id").getAsString(),
                data.has("reason") && !data.get("reason").isJsonNull() ? data.get("reason").getAsString() : "—",
                data.get("totalSeconds").getAsInt(),
                data.get("remainingSeconds").getAsInt(),
                data.has("blocksMined") && !data.get("blocksMined").isJsonNull() ? data.get("blocksMined").getAsInt() : 0);

        if (data.has("inventoryData") && !data.get("inventoryData").isJsonNull()) {
            jail.setInventoryData(data.get("inventoryData").getAsString());
        }
        if (data.has("returnLocation") && !data.get("returnLocation").isJsonNull()) {
            jail.setReturnLocation(LocationCodec.decode(data.get("returnLocation").getAsString()));
        }

        jails.put(player.getUniqueId(), jail);

        if (jail.inventoryData() == null) {
            capture(player, jail); // отсидку выдали, пока игрок был оффлайн
        } else if (!zone.isInside(player.getLocation())) {
            player.teleport(zone.spawn());
        }
        player.sendMessage(messages.get("jail.jailed", Map.of(
                "time", Messages.formatTime(jail.remainingSeconds()),
                "reason", jail.reason())));
        if (plugin.config().jailJobsEnabled) player.sendMessage(messages.get("jail.jobs.hint"));
    }

    /** Новая отсидка, выданная прямо сейчас. */
    public void apply(Player player, String id, String reason, int totalSeconds) {
        Jail jail = new Jail(id, reason, totalSeconds, totalSeconds, 0);
        jails.put(player.getUniqueId(), jail);
        capture(player, jail);
        player.sendMessage(messages.get("jail.jailed", Map.of(
                "time", Messages.formatTime(totalSeconds),
                "reason", reason)));
        if (plugin.config().jailJobsEnabled) player.sendMessage(messages.get("jail.jobs.hint"));
    }

    private void capture(Player player, Jail jail) {
        jail.setReturnLocation(player.getLocation());
        try {
            jail.setInventoryData(InventorySerializer.toBase64(player.getInventory().getContents()));
        } catch (Exception e) {
            // Инвентарь не сохранён — не отбираем его, иначе вещи пропадут навсегда.
            plugin.getLogger().log(Level.SEVERE, "Не сохранён инвентарь " + player.getName(), e);
            player.teleport(zone.spawn());
            sync(player, jail, false);
            return;
        }
        player.getInventory().clear();
        player.getInventory().addItem(tool());
        player.setGameMode(GameMode.SURVIVAL);
        player.setFireTicks(0);
        player.teleport(zone.spawn());
        sync(player, jail, false);
    }

    private ItemStack tool() {
        ItemStack pickaxe = new ItemStack(plugin.config().jailTool);
        ItemMeta meta = pickaxe.getItemMeta();
        if (meta != null) {
            meta.displayName(Component.text("Кирка заключённого"));
            meta.setUnbreakable(true);
            pickaxe.setItemMeta(meta);
        }
        return pickaxe;
    }

    public void release(Player player, boolean early) {
        Jail jail = jails.remove(player.getUniqueId());
        if (jail == null) return;
        if (jobs != null) jobs.forget(player);

        player.getInventory().clear();
        if (jail.inventoryData() != null) {
            try {
                player.getInventory().setContents(InventorySerializer.fromBase64(jail.inventoryData()));
            } catch (Exception e) {
                plugin.getLogger().log(Level.SEVERE, "Не восстановлен инвентарь " + player.getName(), e);
                plugin.getLogger().severe("INVENTORY-DUMP " + player.getName() + " " + jail.inventoryData());
            }
        }
        Location back = jail.returnLocation();
        player.teleport(back != null && back.getWorld() != null
                ? back
                : plugin.getServer().getWorlds().get(0).getSpawnLocation());
        player.sendMessage(messages.get(early ? "jail.released-early" : "jail.released"));
        sync(player, jail, true);
    }

    /** Раз в секунду: списываем срок у сидящих онлайн. */
    public void tick() {
        for (Map.Entry<UUID, Jail> entry : Map.copyOf(jails).entrySet()) {
            Player player = plugin.getServer().getPlayer(entry.getKey());
            if (player == null) continue;
            Jail jail = entry.getValue();

            if (jail.tick(plugin.config().jailRealPerServing)) {
                release(player, false);
                continue;
            }
            player.sendActionBar(messages.plain("jail.actionbar", Map.of(
                    "time", Messages.formatTime(jail.remainingSeconds()),
                    "blocks", String.valueOf(jail.blocksMined()))));

            if (System.currentTimeMillis() - jail.lastSyncAt() > plugin.config().jailSyncSeconds * 1000L) {
                sync(player, jail, false);
            }
        }
    }

    /**
     * Досрочное списание срока — наряд у прораба. Состояние сразу уходит на
     * сайт: иначе выход по наряду потерялся бы при рестарте сервера.
     */
    public boolean reduceSentence(Player player, int seconds) {
        Jail jail = jails.get(player.getUniqueId());
        if (jail == null) return false;

        if (jail.reduce(seconds)) {
            release(player, true);
            return true;
        }
        sync(player, jail, false);
        return false;
    }

    public void countMinedBlock(Player player) {
        Jail jail = jails.get(player.getUniqueId());
        if (jail == null) return;
        if (jail.addMinedBlock(plugin.config().jailSecondsPerBlock)) {
            release(player, false);
        }
    }

    /** Сохраняет состояние на сайт, чтобы срок пережил рестарт. */
    public void sync(Player player, Jail jail, boolean released) {
        jail.markSynced();
        Map<String, Object> body = new HashMap<>();
        body.put("id", jail.id());
        body.put("remainingSeconds", jail.remainingSeconds());
        body.put("blocksMined", jail.blocksMined());
        body.put("released", released);
        if (jail.inventoryData() != null) body.put("inventoryData", jail.inventoryData());
        String location = LocationCodec.encode(jail.returnLocation());
        if (location != null) body.put("returnLocation", location);
        plugin.api().post("/api/mc/jail", body);
    }

    public void syncOnQuit(Player player) {
        Jail jail = jails.remove(player.getUniqueId());
        if (jail != null) sync(player, jail, false);
    }

    public JailZone zone() {
        return zone;
    }
}
