package host.vanilla.core.games;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import host.vanilla.core.VanillaCorePlugin;
import host.vanilla.core.util.Accounts;
import host.vanilla.core.util.Messages;
import net.kyori.adventure.text.Component;
import net.kyori.adventure.text.format.NamedTextColor;
import org.bukkit.Material;
import org.bukkit.NamespacedKey;
import org.bukkit.inventory.Inventory;
import org.bukkit.inventory.ItemStack;
import org.bukkit.inventory.meta.ItemMeta;
import org.bukkit.entity.Player;
import org.bukkit.persistence.PersistentDataType;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * Магазин кейсов в игре: /cases показывает витрину, покупка списывает VC на
 * сайте и кладёт кейс в инвентарь предметом. Открывается он установкой блока —
 * этим занимается CaseListener.
 */
public final class CaseShop {

    /** Ключ, которым помечен предмет-кейс: по нему отличаем его от обычного сундука. */
    private final NamespacedKey caseKeyTag;

    private final VanillaCorePlugin plugin;
    private final Messages messages;

    public CaseShop(VanillaCorePlugin plugin, Messages messages) {
        this.plugin = plugin;
        this.messages = messages;
        this.caseKeyTag = new NamespacedKey(plugin, "case_key");
    }

    public NamespacedKey tag() {
        return caseKeyTag;
    }

    /** Витрина: кейсы с ценами и уже оплаченные, но не полученные. */
    public void openShop(Player player) {
        plugin.api().onMain(
                plugin.api().get("/api/mc/cases?login=" + Accounts.name(player)),
                response -> {
                    if (!player.isOnline() || response.get("_status").getAsInt() != 200) {
                        player.sendMessage(messages.get("cases.api-down"));
                        return;
                    }

                    JsonArray cases = response.getAsJsonArray("cases");
                    int balance = response.get("balance").isJsonNull() ? 0 : response.get("balance").getAsInt();

                    player.sendMessage(messages.get("cases.header", Map.of(
                            "balance", String.valueOf(balance))));
                    for (int i = 0; i < cases.size(); i++) {
                        JsonObject item = cases.get(i).getAsJsonObject();
                        player.sendMessage(messages.get("cases.line", Map.of(
                                "key", item.get("key").getAsString(),
                                "name", item.get("name").getAsString(),
                                "price", String.valueOf(item.get("priceVc").getAsInt()))));
                    }
                    player.sendMessage(messages.get("cases.howto"));

                    // Оплаченные кейсы выдаём предметами сразу: игрок мог купить
                    // на сайте или выйти до того, как поставил блок.
                    JsonArray tickets = response.getAsJsonArray("tickets");
                    for (int i = 0; i < tickets.size(); i++) {
                        JsonObject ticket = tickets.get(i).getAsJsonObject();
                        int count = ticket.get("count").getAsInt();
                        String key = ticket.get("caseKey").getAsString();
                        int inInventory = countCases(player, key);
                        for (int given = inInventory; given < count; given++) {
                            give(player, key, key);
                        }
                    }
                });
    }

    /** Покупка: сначала списание на сайте, потом предмет в руки. */
    public void buy(Player player, String caseKey) {
        plugin.api().onMain(
                plugin.api().post("/api/mc/cases", Map.of(
                        "action", "buy",
                        "login", Accounts.name(player),
                        "caseKey", caseKey)),
                response -> {
                    if (!player.isOnline()) return;
                    String status = response.has("status") ? response.get("status").getAsString() : "error";
                    if (!"ok".equals(status)) {
                        String error = response.has("error")
                                ? response.get("error").getAsString()
                                : "сайт не отвечает";
                        player.sendMessage(messages.get("cases.buy-failed", Map.of("reason", error)));
                        return;
                    }

                    String name = response.get("name").getAsString();
                    int balance = response.get("balance").getAsInt();
                    plugin.auth().profile(player).setBalanceVc(balance);
                    give(player, caseKey, name);
                    player.sendMessage(messages.get("cases.bought", Map.of(
                            "name", name,
                            "balance", String.valueOf(balance))));
                });
    }

    /** Кладёт кейс в инвентарь: помеченный сундук, который можно поставить. */
    public void give(Player player, String caseKey, String name) {
        ItemStack item = new ItemStack(Material.CHEST);
        ItemMeta meta = item.getItemMeta();
        meta.displayName(Component.text("Кейс: " + name, NamedTextColor.GOLD).decoration(
                net.kyori.adventure.text.format.TextDecoration.ITALIC, false));
        List<Component> lore = new ArrayList<>();
        lore.add(Component.text("Правый клик — открыть", NamedTextColor.GRAY)
                .decoration(net.kyori.adventure.text.format.TextDecoration.ITALIC, false));
        lore.add(Component.text("Не выбрасывается и не теряется при смерти", NamedTextColor.DARK_GRAY)
                .decoration(net.kyori.adventure.text.format.TextDecoration.ITALIC, false));
        meta.lore(lore);
        meta.getPersistentDataContainer().set(caseKeyTag, PersistentDataType.STRING, caseKey);
        item.setItemMeta(meta);

        player.getInventory().addItem(item).values().forEach(left ->
                player.getWorld().dropItemNaturally(player.getLocation(), left));
    }

    private int countCases(Player player, String caseKey) {
        int count = 0;
        for (ItemStack stack : player.getInventory().getContents()) {
            if (stack == null || !stack.hasItemMeta()) continue;
            String tagged = stack.getItemMeta().getPersistentDataContainer()
                    .get(caseKeyTag, PersistentDataType.STRING);
            if (caseKey.equals(tagged)) count += stack.getAmount();
        }
        return count;
    }
}
