package host.vanilla.core.admin;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import host.vanilla.core.VanillaCorePlugin;
import host.vanilla.core.util.Accounts;
import host.vanilla.core.util.Messages;
import net.kyori.adventure.text.Component;
import org.bukkit.entity.Player;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * Поручения с сайта: очистка инвентаря после обнуления аккаунта, слепок
 * инвентаря для панели, подхват свежей покупки в магазине и скин из кабинета.
 * Выполняем только для игроков в сети, остальные поручения остаются в очереди
 * и подтверждаются, лишь когда действительно исполнены.
 */
public final class ActionRunner {

    private final VanillaCorePlugin plugin;
    private final Messages messages;

    public ActionRunner(VanillaCorePlugin plugin, Messages messages) {
        this.plugin = plugin;
        this.messages = messages;
    }

    public void poll() {
        if (plugin.getServer().getOnlinePlayers().isEmpty()) return;

        plugin.api().onMain(plugin.api().get("/api/mc/actions"), response -> {
            if (response.get("_status").getAsInt() != 200 || !response.has("actions")) return;

            JsonArray items = response.getAsJsonArray("actions");
            List<String> done = new ArrayList<>();

            for (int i = 0; i < items.size(); i++) {
                JsonObject item = items.get(i).getAsJsonObject();
                String kind = item.get("kind").getAsString();
                String login = item.get("login").getAsString();

                // Объявление о редкой находке адресовано всему серверу, поэтому
                // его не ждём в сети: подтверждаем сразу после показа.
                if ("BROADCAST_DROP".equals(kind)) {
                    broadcastDrop(login, item);
                    done.add(item.get("id").getAsString());
                    continue;
                }

                Player player = Accounts.findOnline(login);
                if (player == null || !plugin.auth().authenticated(player)) continue;

                if ("WIPE_INVENTORY".equals(kind) && wipe(player)) {
                    done.add(item.get("id").getAsString());
                }

                // Панель открыла инвентарь и просит свежий слепок вне очереди.
                if ("SNAPSHOT_INVENTORY".equals(kind)) {
                    plugin.inventories().report(player);
                    done.add(item.get("id").getAsString());
                }

                if ("APPLY_SKIN".equals(kind) && applySkin(player, item)) {
                    done.add(item.get("id").getAsString());
                }

                // Покупка на сайте: включаем её в игре, не дожидаясь перезахода.
                if ("REFRESH_SHOP".equals(kind)) {
                    plugin.shop().refresh(player, () -> {
                        if (player.isOnline()) player.sendMessage(messages.get("shop.activated"));
                    });
                    done.add(item.get("id").getAsString());
                }
            }

            if (!done.isEmpty()) {
                plugin.api().post("/api/mc/actions", Map.of("ids", done));
            }
        });
    }

    /**
     * Скин из личного кабинета. Своей реализации у нас нет — скины на
     * offline-сервере раздаёт SkinsRestorer, и мы просто отдаём ему команды от
     * консоли. Картинку он забирает по ссылке с нашего сайта: имя скина несёт
     * время правки, иначе SkinsRestorer отдал бы прошлую картинку из кэша.
     */
    private boolean applySkin(Player player, JsonObject item) {
        if (plugin.getServer().getPluginManager().getPlugin("SkinsRestorer") == null) {
            plugin.getLogger().warning("Скин не применён: SkinsRestorer не установлен");
            return true;
        }
        if (!item.has("payload") || !item.get("payload").isJsonObject()) return true;
        JsonObject payload = item.getAsJsonObject("payload");
        String mode = payload.has("mode") ? payload.get("mode").getAsString() : "";
        String name = player.getName();

        List<String> commands = switch (mode) {
            case "clear" -> List.of("skin clear " + name);
            // Для чужого ника модель не навязываем: она приедет вместе со скином.
            case "nick" -> List.of("skin set " + payload.get("nick").getAsString() + " " + name);
            case "url" -> List.of(
                    "sr createcustom " + payload.get("name").getAsString() + " "
                            + payload.get("url").getAsString() + " " + variant(payload),
                    "skin set " + payload.get("name").getAsString() + " " + name);
            default -> List.of();
        };
        if (commands.isEmpty()) return true;

        for (String command : commands) {
            plugin.getServer().dispatchCommand(plugin.getServer().getConsoleSender(), command);
        }
        player.sendMessage(messages.get(mode.equals("clear") ? "skin.cleared" : "skin.applied"));
        return true;
    }

    /** SkinsRestorer ждёт classic или slim; чужое значение он бы не понял. */
    private String variant(JsonObject payload) {
        String value = payload.has("variant") ? payload.get("variant").getAsString() : "classic";
        return "slim".equals(value) ? "slim" : "classic";
    }

    /** Редкая находка: объявляем всем, чтобы кейсы было видно со стороны. */
    private void broadcastDrop(String login, JsonObject item) {
        if (!item.has("payload") || item.get("payload").isJsonNull()) return;
        JsonObject payload = item.getAsJsonObject("payload");
        String rarity = payload.has("rarity") ? payload.get("rarity").getAsString() : "epic";

        Component message = messages.get("cases.broadcast", java.util.Map.of(
                "player", login,
                "item", payload.has("cosmetic") ? payload.get("cosmetic").getAsString() : "предмет",
                "rarity", host.vanilla.core.games.CaseListener.rarityName(rarity),
                "case", payload.has("case") ? payload.get("case").getAsString() : ""));

        for (Player online : plugin.getServer().getOnlinePlayers()) {
            online.sendMessage(message);
            online.playSound(online.getLocation(),
                    org.bukkit.Sound.ENTITY_EXPERIENCE_ORB_PICKUP, 0.6f,
                    "legendary".equals(rarity) ? 1.6f : 1.2f);
        }
    }

    /** Полная очистка: инвентарь, эндер-сундук, опыт и эффекты. */
    private boolean wipe(Player player) {
        player.getInventory().clear();
        player.getInventory().setArmorContents(null);
        player.getInventory().setItemInOffHand(null);
        player.getEnderChest().clear();
        player.setLevel(0);
        player.setExp(0f);
        player.setTotalExperience(0);
        player.getActivePotionEffects().forEach(effect -> player.removePotionEffect(effect.getType()));
        player.sendMessage(messages.get("admin.wiped"));
        plugin.getLogger().info("Инвентарь игрока " + player.getName() + " очищен по поручению сайта");
        return true;
    }
}
