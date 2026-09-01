package host.vanilla.core.chat;

import host.vanilla.core.VanillaCorePlugin;
import host.vanilla.core.util.Messages;
import io.papermc.paper.event.player.AsyncChatEvent;
import net.kyori.adventure.text.Component;
import net.kyori.adventure.text.TextReplacementConfig;
import net.kyori.adventure.text.serializer.plain.PlainTextComponentSerializer;
import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.EventPriority;
import org.bukkit.event.Listener;

import java.util.Map;

/**
 * Разделение чата. Обычное сообщение слышно только рядом — так на общей карте
 * можно говорить, не засоряя чат всему серверу. Сообщение, начатое с «!», уходит
 * всем.
 *
 * Администрация со 2 уровня слышит и местные разговоры: иначе разбирать жалобы
 * пришлось бы, стоя вплотную к нарушителю.
 */
public final class ChatListener implements Listener {

    private static final PlainTextComponentSerializer PLAIN = PlainTextComponentSerializer.plainText();

    private final VanillaCorePlugin plugin;
    private final Messages messages;
    /**
     * Куда ушло сообщение, которое сейчас разбираем. Оба обработчика идут по
     * одному событию в одном потоке, а к MONITOR символ «!» из текста уже
     * убран — определить область там заново нельзя.
     */
    private final ThreadLocal<String> scope = new ThreadLocal<>();

    public ChatListener(VanillaCorePlugin plugin, Messages messages) {
        this.plugin = plugin;
        this.messages = messages;
    }

    // LOW: разбираем ещё не тронутое сообщение. BreweryX искажает речь пьяного
    // игрока на этом же событии, и после него «!» в начале можно не узнать.
    @EventHandler(priority = EventPriority.LOW, ignoreCancelled = true)
    public void onChat(AsyncChatEvent event) {
        int radius = plugin.config().chatLocalRadius;
        if (radius <= 0) {
            // Деления на местный и общий нет — в Telegram пойдёт без метки.
            scope.remove();
            return;
        }

        Player sender = event.getPlayer();
        String prefix = plugin.config().chatGlobalPrefix;
        String plain = PLAIN.serialize(event.message());
        boolean global = !prefix.isEmpty() && plain.startsWith(prefix);

        if (global) {
            // Один «!» без текста — не сообщение, а промах по клавише.
            if (plain.substring(prefix.length()).isBlank()) {
                scope.remove();
                event.setCancelled(true);
                sender.sendMessage(messages.get("chat.global-empty", Map.of("prefix", prefix)));
                return;
            }
            event.message(event.message().replaceText(TextReplacementConfig.builder()
                    .matchLiteral(prefix)
                    .once()
                    .replacement("")
                    .build()));
        } else {
            event.viewers().removeIf(audience ->
                    audience instanceof Player viewer && !hears(sender, viewer, radius));
        }

        scope.set(global ? "всем" : "рядом");
        Component tag = messages.plain(global ? "chat.global-tag" : "chat.local-tag", Map.of());
        event.renderer((source, displayName, message, viewer) ->
                tag.append(displayName).append(Component.text(": ")).append(message));

        // Считаем именно соседей: админ слышит издалека, но собеседником от этого
        // не становится, и подсказка «рядом никого» должна остаться честной.
        if (!global && !hasNeighbour(sender, radius)) {
            sender.sendMessage(messages.get("chat.alone", Map.of("prefix", prefix)));
        }
    }

    /**
     * Копия сообщения для Telegram. Берём на MONITOR: к этому моменту текст
     * окончательный — искажение речи пьяного уже применено, — и видно, отменил
     * ли сообщение кто-то другой.
     */
    @EventHandler(priority = EventPriority.MONITOR, ignoreCancelled = true)
    public void relay(AsyncChatEvent event) {
        String where = scope.get();
        scope.remove();
        // Пересылаем только общий чат: местные разговоры на то и местные, да и
        // в Telegram от них был бы поток без контекста.
        boolean global = where == null || "всем".equals(where);
        if (!global) return;

        plugin.chatRelay().add(event.getPlayer().getName(), PLAIN.serialize(event.message()));
    }

    private boolean hears(Player sender, Player viewer, int radius) {
        return plugin.auth().adminLevel(viewer) >= 2 || near(sender, viewer, radius);
    }

    private boolean hasNeighbour(Player sender, int radius) {
        for (Player viewer : sender.getServer().getOnlinePlayers()) {
            if (!viewer.equals(sender) && near(sender, viewer, radius)) return true;
        }
        return false;
    }

    private boolean near(Player sender, Player viewer, int radius) {
        if (viewer.equals(sender)) return true;
        if (!viewer.getWorld().equals(sender.getWorld())) return false;
        return viewer.getLocation().distanceSquared(sender.getLocation()) <= (double) radius * radius;
    }
}
