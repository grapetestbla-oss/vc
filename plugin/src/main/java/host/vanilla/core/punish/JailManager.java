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
    private long lastTeleportWarning;

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
            sendToZone(player);
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

    /**
     * Переносит игрока в зону и убеждается, что он там оказался. Телепорт
     * может не сработать: наблюдатель «прилип» к чужой камере, другой плагин
     * отменил перемещение, мир не успел прогрузиться. Молча это оставлять
     * нельзя — иначе наказанный остаётся гулять по обычному миру.
     */
    private void sendToZone(Player player) {
        // Игрока с пассажирами Minecraft телепортировать не даёт, а над головой
        // может ехать косметический титул — из-за него перенос молча
        // проваливался. В деморгане косметика и так не работает, поэтому
        // снимаем её целиком: заодно уезжает питомец.
        player.getPassengers().forEach(player::removePassenger);
        if (player.isInsideVehicle()) player.leaveVehicle();
        plugin.cosmetics().forget(player);

        if (player.getGameMode() != GameMode.SURVIVAL) {
            // Наблюдатель пролетает сквозь стены, творческий — летает.
            player.setSpectatorTarget(null);
            player.setGameMode(GameMode.SURVIVAL);
        }
        player.setFireTicks(0);

        Location spawn = zone.spawn();
        if (!player.teleport(spawn)) {
            // Повторы идут раз в секунду сторожем, поэтому в лог пишем не
            // каждую попытку, а раз в полминуты — иначе он забивается.
            long now = System.currentTimeMillis();
            if (now - lastTeleportWarning > 30_000) {
                lastTeleportWarning = now;
                plugin.getLogger().warning("Не удалось перенести " + player.getName()
                        + " в деморган: перенос отменён. Повторяю.");
            }
        }

        // Выход из наблюдателя возвращает игрока туда, где он в него вошёл, —
        // и делает это уже после нашего переноса. Поэтому проверяем ещё раз
        // через пару тиков и, для верности, через полсекунды.
        for (long delay : new long[] {2L, 10L}) {
            plugin.getServer().getScheduler().runTaskLater(plugin, () -> {
                if (!player.isOnline() || !jails.containsKey(player.getUniqueId())) return;
                if (zone.isInside(player.getLocation())) return;
                player.teleport(zone.spawn());
            }, delay);
        }
    }

    private void capture(Player player, Jail jail) {
        jail.setReturnLocation(player.getLocation());
        try {
            jail.setInventoryData(InventorySerializer.toBase64(player.getInventory().getContents()));
        } catch (Exception e) {
            // Инвентарь не сохранён — не отбираем его, иначе вещи пропадут навсегда.
            plugin.getLogger().log(Level.SEVERE, "Не сохранён инвентарь " + player.getName(), e);
            sendToZone(player);
            sync(player, jail, false);
            return;
        }
        player.getInventory().clear();
        player.getInventory().addItem(tool());
        sendToZone(player);
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
        // Косметику снимали при посадке — возвращаем, как только вышел.
        plugin.reloadCosmetics(player);
        sync(player, jail, true);
    }

    /** Раз в секунду: списываем срок у сидящих онлайн и следим, что они в зоне. */
    public void tick() {
        for (Map.Entry<UUID, Jail> entry : Map.copyOf(jails).entrySet()) {
            Player player = plugin.getServer().getPlayer(entry.getKey());
            if (player == null) continue;
            Jail jail = entry.getValue();

            // Сторож: из деморгана нельзя выйти ни телепортом, ни полётом, ни
            // потому что перенос при посадке не сработал.
            if (!zone.isInside(player.getLocation()) || player.getGameMode() != GameMode.SURVIVAL) {
                sendToZone(player);
            }

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
