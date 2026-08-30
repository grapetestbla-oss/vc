package host.vanilla.core.admin;

import host.vanilla.core.VanillaCorePlugin;
import host.vanilla.core.util.Accounts;
import org.bukkit.enchantments.Enchantment;
import org.bukkit.entity.Player;
import org.bukkit.inventory.ItemStack;
import org.bukkit.inventory.meta.Damageable;
import org.bukkit.inventory.meta.ItemMeta;
import net.kyori.adventure.text.serializer.plain.PlainTextComponentSerializer;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Слепок инвентаря для панели. Base64 из InventorySerializer читает только сам
 * Bukkit, поэтому сайту отправляем разобранный список предметов: слот, предмет,
 * количество, зачарования. Панель показывает его как сетку.
 */
public final class InventoryReporter {

    private static final PlainTextComponentSerializer PLAIN = PlainTextComponentSerializer.plainText();

    private final VanillaCorePlugin plugin;

    public InventoryReporter(VanillaCorePlugin plugin) {
        this.plugin = plugin;
    }

    /** Периодический обход: панель не должна показывать данные недельной давности. */
    public void reportAll() {
        for (Player player : plugin.getServer().getOnlinePlayers()) {
            if (plugin.auth().authenticated(player)) report(player);
        }
    }

    public void report(Player player) {
        plugin.api().post("/api/mc/inventory", snapshot(player));
    }

    private Map<String, Object> snapshot(Player player) {
        List<Map<String, Object>> items = new ArrayList<>();

        ItemStack[] main = player.getInventory().getContents();
        for (int slot = 0; slot < main.length && slot < 36; slot++) {
            add(items, "main", slot, main[slot]);
        }
        ItemStack[] armor = player.getInventory().getArmorContents();
        // getArmorContents отдаёт ботинки → шлем, а в панели привычнее наоборот.
        String[] armorSlots = {"boots", "leggings", "chestplate", "helmet"};
        for (int slot = 0; slot < armor.length && slot < armorSlots.length; slot++) {
            add(items, "armor", slot, armor[slot], armorSlots[slot]);
        }
        add(items, "offhand", 0, player.getInventory().getItemInOffHand());

        ItemStack[] ender = player.getEnderChest().getContents();
        for (int slot = 0; slot < ender.length; slot++) {
            add(items, "ender", slot, ender[slot]);
        }

        Map<String, Object> body = new HashMap<>();
        body.put("login", Accounts.name(player));
        body.put("world", player.getWorld().getName());
        body.put("x", player.getLocation().getBlockX());
        body.put("y", player.getLocation().getBlockY());
        body.put("z", player.getLocation().getBlockZ());
        body.put("health", (int) Math.round(player.getHealth()));
        body.put("food", player.getFoodLevel());
        body.put("xpLevel", player.getLevel());
        body.put("gameMode", player.getGameMode().name());
        body.put("items", items);
        return body;
    }

    private void add(List<Map<String, Object>> items, String area, int slot, ItemStack stack) {
        add(items, area, slot, stack, null);
    }

    private void add(List<Map<String, Object>> items, String area, int slot, ItemStack stack, String label) {
        if (stack == null || stack.getType().isAir() || stack.getAmount() <= 0) return;

        Map<String, Object> item = new HashMap<>();
        item.put("area", area);
        item.put("slot", slot);
        if (label != null) item.put("label", label);
        item.put("type", stack.getType().getKey().getKey());
        item.put("amount", stack.getAmount());

        ItemMeta meta = stack.hasItemMeta() ? stack.getItemMeta() : null;
        if (meta != null) {
            if (meta.hasDisplayName() && meta.displayName() != null) {
                item.put("name", PLAIN.serialize(meta.displayName()));
            }
            if (meta instanceof Damageable damageable && damageable.hasDamage()) {
                item.put("damage", damageable.getDamage());
                item.put("maxDamage", stack.getType().getMaxDurability());
            }
            if (!meta.getEnchants().isEmpty()) {
                List<String> enchants = new ArrayList<>();
                for (Map.Entry<Enchantment, Integer> entry : meta.getEnchants().entrySet()) {
                    enchants.add(entry.getKey().getKey().getKey() + " " + entry.getValue());
                }
                item.put("enchants", enchants);
            }
        }
        items.add(item);
    }
}
