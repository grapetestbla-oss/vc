package host.vanilla.demorgan;

import net.kyori.adventure.text.Component;
import org.bukkit.GameMode;
import org.bukkit.Location;
import org.bukkit.entity.Player;
import org.bukkit.inventory.ItemStack;
import org.bukkit.inventory.meta.ItemMeta;

import java.util.HashMap;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.logging.Level;

/** Ядро: кто сидит, сколько осталось, что происходит при посадке и освобождении. */
public final class PunishmentManager {

    private final DemorganPlugin plugin;
    private final PluginConfig config;
    private final ZoneManager zone;
    private final Storage storage;
    private final Messages messages;
    private final DiscordLogger discord;

    private final Map<UUID, Punishment> active = new HashMap<>();
    private final Map<UUID, Integer> history = new HashMap<>();

    public PunishmentManager(DemorganPlugin plugin, PluginConfig config, ZoneManager zone,
                             Storage storage, Messages messages, DiscordLogger discord) {
        this.plugin = plugin;
        this.config = config;
        this.zone = zone;
        this.storage = storage;
        this.messages = messages;
        this.discord = discord;
    }

    public void load() {
        Storage.Data data = storage.load();
        active.putAll(data.active());
        history.putAll(data.history());
        plugin.getLogger().info("Загружено активных наказаний: " + active.size());
    }

    public void save() {
        storage.save(active, history);
    }

    public boolean isJailed(UUID uuid) {
        return active.containsKey(uuid);
    }

    public Optional<Punishment> get(UUID uuid) {
        return Optional.ofNullable(active.get(uuid));
    }

    public int offences(UUID uuid) {
        return history.getOrDefault(uuid, 0);
    }

    public Map<UUID, Punishment> active() {
        return Map.copyOf(active);
    }

    /** Выдать срок. Игрок может быть оффлайн — тогда срок применится при входе. */
    public Punishment jail(UUID uuid, String name, Player online, int minutes, String reason, String issuedBy) {
        int seconds = minutes * 60;
        Punishment punishment = new Punishment(uuid, name, reason, issuedBy,
                System.currentTimeMillis(), seconds, seconds, 0, null, null);
        active.put(uuid, punishment);
        history.merge(uuid, 1, Integer::sum);

        if (online != null) {
            capture(online, punishment);
            online.sendMessage(messages.get("jailed", Map.of(
                    "time", Messages.formatTime(seconds),
                    "reason", reason)));
        }
        plugin.getServer().broadcast(messages.get("jailed-broadcast", Map.of(
                "player", name,
                "time", Messages.formatTime(seconds),
                "reason", reason)));
        discord.log("**Деморган выдан** — `" + name + "` на " + minutes + " мин. Причина: " + reason
                + ". Выдал: " + issuedBy + ". Нарушение №" + offences(uuid));
        save();
        return punishment;
    }

    /** Забираем инвентарь, ставим на точку задержания, отправляем в зону. */
    private void capture(Player player, Punishment punishment) {
        punishment.setReturnLocation(player.getLocation());
        try {
            punishment.setInventoryData(InventorySerializer.toBase64(player.getInventory().getContents()));
        } catch (Exception e) {
            plugin.getLogger().log(Level.SEVERE, "Не удалось сохранить инвентарь " + player.getName()
                    + " — инвентарь оставлен игроку", e);
            // Инвентарь не сохранён — не отбираем его, иначе вещи пропадут навсегда.
            player.teleport(zone.spawnLocation());
            return;
        }
        player.getInventory().clear();
        player.getInventory().addItem(prisonTool());
        player.setGameMode(GameMode.SURVIVAL);
        player.setFireTicks(0);
        player.teleport(zone.spawnLocation());
    }

    private ItemStack prisonTool() {
        ItemStack tool = new ItemStack(config.tool);
        ItemMeta meta = tool.getItemMeta();
        if (meta != null) {
            meta.displayName(Component.text("Кирка заключённого"));
            meta.setUnbreakable(true);
            tool.setItemMeta(meta);
        }
        return tool;
    }

    /** Освобождение: по отбытию срока или досрочно админом. */
    public void release(UUID uuid, boolean early, String by) {
        Punishment punishment = active.remove(uuid);
        if (punishment == null) return;

        Player player = plugin.getServer().getPlayer(uuid);
        if (player != null) {
            restore(player, punishment);
            player.sendMessage(messages.get(early ? "released-early" : "released"));
        }
        if (!early) {
            plugin.getServer().broadcast(messages.get("released-broadcast", Map.of("player", punishment.name())));
        }
        discord.log(early
                ? "**Досрочное освобождение** — `" + punishment.name() + "`, снял: " + by
                : "**Срок отбыт** — `" + punishment.name() + "`, блоков отработано: " + punishment.blocksMined());
        save();
    }

    private void restore(Player player, Punishment punishment) {
        player.getInventory().clear();
        String data = punishment.inventoryData();
        if (data != null) {
            try {
                player.getInventory().setContents(InventorySerializer.fromBase64(data));
            } catch (Exception e) {
                plugin.getLogger().log(Level.SEVERE, "Не удалось вернуть инвентарь " + player.getName()
                        + ". Данные сохранены в логе ниже.", e);
                plugin.getLogger().severe("INVENTORY-DUMP " + player.getName() + " " + data);
            }
        }
        Location back = punishment.returnLocation();
        player.teleport(back != null && back.getWorld() != null
                ? back
                : plugin.getServer().getWorlds().get(0).getSpawnLocation());
    }

    /** Вход: дотягиваем оффлайн-выдачу и возвращаем беглецов в зону. */
    public void handleJoin(Player player) {
        Punishment punishment = active.get(player.getUniqueId());
        if (punishment == null) return;
        if (punishment.inventoryData() == null) {
            capture(player, punishment);
            player.sendMessage(messages.get("jailed", Map.of(
                    "time", Messages.formatTime(punishment.remainingSeconds()),
                    "reason", punishment.reason())));
        } else if (!zone.isInside(player.getLocation())) {
            player.teleport(zone.spawnLocation());
        }
    }

    /** Раз в секунду: списываем срок только у тех, кто реально сидит онлайн. */
    public void tick() {
        for (Map.Entry<UUID, Punishment> entry : Map.copyOf(active).entrySet()) {
            Player player = plugin.getServer().getPlayer(entry.getKey());
            if (player == null) continue;
            Punishment punishment = entry.getValue();
            if (punishment.tickSecond()) {
                release(entry.getKey(), false, "system");
                continue;
            }
            player.sendActionBar(messages.plain("actionbar", Map.of(
                    "time", Messages.formatTime(punishment.remainingSeconds()),
                    "blocks", String.valueOf(punishment.blocksMined()))));
        }
    }

    /** Отработка: добытый блок сокращает срок. */
    public void countMinedBlock(Player player) {
        Punishment punishment = active.get(player.getUniqueId());
        if (punishment == null) return;
        if (punishment.addMinedBlock(config.secondsPerBlock)) {
            release(player.getUniqueId(), false, "system");
        }
    }
}
