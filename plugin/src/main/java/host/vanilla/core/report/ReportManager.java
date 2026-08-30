package host.vanilla.core.report;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import host.vanilla.core.VanillaCorePlugin;
import host.vanilla.core.util.Accounts;
import host.vanilla.core.util.Messages;
import net.kyori.adventure.text.Component;
import net.kyori.adventure.text.format.NamedTextColor;
import org.bukkit.Bukkit;
import org.bukkit.Material;
import org.bukkit.entity.Player;
import org.bukkit.inventory.Inventory;
import org.bukkit.inventory.ItemStack;
import org.bukkit.inventory.meta.ItemMeta;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * Репорты. Игрок пишет /report, админам падает уведомление, /reports открывает
 * меню. Захват репорта делает сервер сайта — первый успевший забирает его себе,
 * остальные получают отказ, даже если нажали одновременно.
 */
public final class ReportManager {

    public record Entry(String id, String text, String author, String status, String claimedBy) {}

    private final VanillaCorePlugin plugin;
    private final Messages messages;
    private final List<Entry> cache = new ArrayList<>();

    public ReportManager(VanillaCorePlugin plugin, Messages messages) {
        this.plugin = plugin;
        this.messages = messages;
    }

    public void create(Player author, String text) {
        plugin.api().onMain(
                plugin.api().post("/api/mc/report", Map.of("login", Accounts.name(author), "text", text)),
                response -> {
                    if (response.get("_status").getAsInt() != 200) {
                        author.sendMessage(messages.get("report.failed"));
                        return;
                    }
                    author.sendMessage(messages.get("report.created"));
                    notifyStaff(Accounts.name(author), text);
                });
    }

    private void notifyStaff(String author, String text) {
        Component message = messages.get("report.notify", Map.of("player", author, "text", text));
        Bukkit.getOnlinePlayers().stream()
                .filter(player -> plugin.auth().adminLevel(player) >= 2)
                .forEach(player -> player.sendMessage(message));
    }

    public void openMenu(Player admin) {
        plugin.api().onMain(plugin.api().get("/api/mc/reports"), response -> {
            cache.clear();
            if (response.has("reports")) {
                JsonArray array = response.getAsJsonArray("reports");
                for (int i = 0; i < array.size(); i++) {
                    JsonObject item = array.get(i).getAsJsonObject();
                    cache.add(new Entry(
                            item.get("id").getAsString(),
                            item.get("text").getAsString(),
                            item.get("author").getAsString(),
                            item.get("status").getAsString(),
                            item.get("claimedBy").isJsonNull() ? null : item.get("claimedBy").getAsString()));
                }
            }
            if (cache.isEmpty()) {
                admin.sendMessage(messages.get("report.empty"));
                return;
            }
            admin.openInventory(buildInventory());
        });
    }

    private Inventory buildInventory() {
        int rows = Math.min(6, Math.max(1, (cache.size() + 8) / 9));
        Inventory inventory = Bukkit.createInventory(new ReportMenuHolder(), rows * 9,
                Component.text("Репорты", NamedTextColor.GOLD));

        for (int i = 0; i < Math.min(cache.size(), rows * 9); i++) {
            Entry entry = cache.get(i);
            ItemStack item = new ItemStack(entry.claimedBy() == null ? Material.PAPER : Material.MAP);
            ItemMeta meta = item.getItemMeta();
            if (meta != null) {
                meta.displayName(Component.text(entry.author(), NamedTextColor.YELLOW));
                meta.lore(List.of(
                        Component.text(entry.text(), NamedTextColor.WHITE),
                        Component.text(entry.claimedBy() == null
                                ? "Свободен — нажмите, чтобы взять"
                                : "Взял: " + entry.claimedBy(), NamedTextColor.GRAY)));
                item.setItemMeta(meta);
            }
            inventory.setItem(i, item);
        }
        return inventory;
    }

    public Entry entryAt(int slot) {
        return slot >= 0 && slot < cache.size() ? cache.get(slot) : null;
    }

    public void claim(Player admin, Entry entry) {
        plugin.api().onMain(
                plugin.api().post("/api/mc/reports", Map.of("id", entry.id(), "actorLogin", Accounts.name(admin))),
                response -> {
                    int status = response.get("_status").getAsInt();
                    if (status == 409) {
                        admin.sendMessage(messages.get("report.taken"));
                        return;
                    }
                    if (status != 200) {
                        admin.sendMessage(messages.get("report.failed"));
                        return;
                    }
                    admin.sendMessage(messages.get("report.claimed", Map.of(
                            "player", entry.author(),
                            "text", entry.text())));
                    // Разбор начинается сразу: телепорты и закрытие — в меню,
                    // чтобы не вспоминать команды посреди разбирательства.
                    openActions(admin, entry);
                });
    }

    /** Меню взятого репорта: телепорты к автору и закрытие. */
    public void openActions(Player admin, Entry entry) {
        Inventory inventory = Bukkit.createInventory(new ReportActionHolder(entry), 9,
                Component.text("Репорт: " + entry.author(), NamedTextColor.GOLD));

        boolean online = Accounts.findOnline(entry.author()) != null;
        inventory.setItem(SLOT_INFO, button(Material.PAPER,
                Component.text(entry.author(), NamedTextColor.YELLOW),
                List.of(
                        Component.text(entry.text(), NamedTextColor.WHITE),
                        Component.text(online ? "Игрок в сети" : "Игрок не в сети",
                                online ? NamedTextColor.GRAY : NamedTextColor.RED))));

        inventory.setItem(SLOT_TP_TO, button(Material.ENDER_PEARL,
                Component.text("Телепортироваться к игроку", NamedTextColor.AQUA),
                List.of(Component.text("Вы окажетесь рядом с автором", NamedTextColor.GRAY))));

        inventory.setItem(SLOT_TP_HERE, button(Material.LEAD,
                Component.text("Телепортировать игрока к себе", NamedTextColor.AQUA),
                List.of(Component.text("Автор окажется рядом с вами", NamedTextColor.GRAY))));

        inventory.setItem(SLOT_CLOSE, button(Material.LIME_DYE,
                Component.text("Закрыть репорт", NamedTextColor.GREEN),
                List.of(Component.text("Пометить как разобранный", NamedTextColor.GRAY))));

        inventory.setItem(SLOT_BACK, button(Material.ARROW,
                Component.text("К списку репортов", NamedTextColor.GRAY), List.of()));

        admin.openInventory(inventory);
    }

    /** Слоты меню одного репорта — их же читает листенер. */
    public static final int SLOT_INFO = 0;
    public static final int SLOT_TP_TO = 2;
    public static final int SLOT_TP_HERE = 4;
    public static final int SLOT_CLOSE = 6;
    public static final int SLOT_BACK = 8;

    private static ItemStack button(Material material, Component name, List<Component> lore) {
        ItemStack item = new ItemStack(material);
        ItemMeta meta = item.getItemMeta();
        if (meta != null) {
            meta.displayName(name.decoration(net.kyori.adventure.text.format.TextDecoration.ITALIC, false));
            meta.lore(lore.stream()
                    .map(line -> line.decoration(net.kyori.adventure.text.format.TextDecoration.ITALIC, false))
                    .toList());
            item.setItemMeta(meta);
        }
        return item;
    }

    /** Телепорт по репорту: обе стороны видят, что произошло. */
    public void teleport(Player admin, Entry entry, boolean bringHere) {
        Player author = Accounts.findOnline(entry.author());
        if (author == null) {
            admin.sendMessage(messages.get("report.author-offline"));
            return;
        }

        if (bringHere) {
            author.teleport(admin.getLocation());
            author.sendMessage(messages.get("report.pulled", Map.of("admin", admin.getName())));
            admin.sendMessage(messages.get("staff.tphere", Map.of("player", author.getName())));
        } else {
            admin.teleport(author.getLocation());
            admin.sendMessage(messages.get("staff.tp", Map.of("player", author.getName())));
        }
        plugin.logAdminAction(admin, bringHere ? "report.tphere" : "report.tp", author.getName(),
                Map.of("report", entry.id()));
    }

    public void close(Player admin, String id, String resolution) {
        plugin.api().onMain(
                plugin.api().post("/api/mc/reports", Map.of(
                        "id", id,
                        "actorLogin", Accounts.name(admin),
                        "close", true,
                        "resolution", resolution)),
                response -> admin.sendMessage(response.get("_status").getAsInt() == 200
                        ? messages.get("report.closed")
                        : messages.get("report.failed")));
    }
}
