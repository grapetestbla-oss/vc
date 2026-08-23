package host.vanilla.core.report;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import host.vanilla.core.VanillaCorePlugin;
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
                plugin.api().post("/api/mc/report", Map.of("login", author.getName(), "text", text)),
                response -> {
                    if (response.get("_status").getAsInt() != 200) {
                        author.sendMessage(messages.get("report.failed"));
                        return;
                    }
                    author.sendMessage(messages.get("report.created"));
                    notifyStaff(author.getName(), text);
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
                plugin.api().post("/api/mc/reports", Map.of("id", entry.id(), "actorLogin", admin.getName())),
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

                    Player author = Bukkit.getPlayerExact(entry.author());
                    if (author == null) {
                        admin.sendMessage(messages.get("report.author-offline"));
                        return;
                    }
                    admin.sendMessage(messages.get("report.actions", Map.of("player", author.getName())));
                });
    }

    public void close(Player admin, String id, String resolution) {
        plugin.api().onMain(
                plugin.api().post("/api/mc/reports", Map.of(
                        "id", id,
                        "actorLogin", admin.getName(),
                        "close", true,
                        "resolution", resolution)),
                response -> admin.sendMessage(response.get("_status").getAsInt() == 200
                        ? messages.get("report.closed")
                        : messages.get("report.failed")));
    }
}
