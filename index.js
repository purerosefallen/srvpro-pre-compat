const sqlite3 = require('sqlite3').verbose();

import_datas.push("is_using_pre_release");
ygopro.i18ns["en-us"].pre_release_compat_hint = "It seems like you're a duelist with pre-release cards. The pre-release compat mode is turned on.";
ygopro.i18ns["zh-cn"].pre_release_compat_hint = "看起来你是使用先行卡数据的用户，已开启先行卡兼容模式。";

const config = require("./config.json");

function replace_buffer(buffer, list, start_pos) { 
	var found = 0;
	const len = buffer.length;
	if (!list ||len < 4 + start_pos) {
		return 0;
	}
	for (var i = 0; i < len - 3; ++i) { 
		var code = buffer.readInt32LE(i);
		if (list[code]) { 
			code = list[code];
			buffer.writeInt32LE(code, i);
			found++;
			i += 3;
			if (i >= len - 4) { 
				break;
			}
		}
	}
	return found;
}

ygopro.stoc_follow_before("JOIN_GAME", false, async (buffer, info, client, server, datas) => {
	var room = ROOM_all[client.rid];
	if (!room || room.list_official_to_pre) {
		return;
	}
	room.list_official_to_pre = {};
	room.list_pre_to_official = {};
	var temp_list = {};
	var official_database = new sqlite3.Database(config.official_database);
	var pre_release_database = new sqlite3.Database(config.pre_release_database);
	pre_release_database.each("select id,name from texts", (err, result) => {
		if (err) {
			log.warn("pre-release load error", err);
		} else {
			temp_list[result.name] = result.id;
		}
	}, (err) => {
		if (err) {
			log.warn("pre-release load fail", err);
		} else {
			official_database.each("select id,name from texts", (err, result) => {
				if (err) {
					log.warn("official load error", err);
				} else if (temp_list[result.name] && temp_list[result.name] !== result.id) { 
					const official_code = result.id;
					const pre_release_code = temp_list[result.name];
					room.list_official_to_pre[official_code] = pre_release_code;
					room.list_pre_to_official[pre_release_code] = official_code;
				}
			}, (err) => { 
				if (err) {
					log.warn("official load fail", err);
				}
			})
		}
	});
});

ygopro.ctos_follow_after("PLAYER_INFO", false, async (buffer, info, client, server, datas) => {
	client.is_using_pre_release = client.name_vpass == "COMPAT";
});

ygopro.ctos_follow_after("UPDATE_DECK", false, async (buffer, info, client, server, datas) => {
	var room = ROOM_all[client.rid];
	if (!room) {
		return;
	}
	var found = false;
	var buff_main_new = [];
	var buff_side_new = [];
	for (var code of client.main) {
		var code_ = code;
		if (room.list_pre_to_official[code]) {
			code_ = room.list_pre_to_official[code];
			found = true;
		}
		buff_main_new.push(code_);
	}
	for (var code of client.side) {
		var code_ = code;
		if (room.list_pre_to_official[code]) {
			code_ = room.list_pre_to_official[code];
			found = true;
		}
		buff_side_new.push(code_);
	}
	if (found) { 
		var compat_deckbuf = buff_main_new.concat(buff_side_new);
		var struct = ygopro.structs["deck"];
		struct._setBuff(buffer);
		struct.set("mainc", buff_main_new.length);
		struct.set("sidec", buff_side_new.length);
		struct.set("deckbuf", compat_deckbuf);
		buffer = struct.buffer;
	}
	if (room.duel_stage == ygopro.constants.DUEL_STAGE.BEGIN) { 
		client.is_using_pre_release = found || client.vpass == "COMPAT";
		if (client.is_using_pre_release) { 
			ygopro.stoc_send_chat(client, "${pre_release_compat_hint}", ygopro.constants.COLORS.BABYBLUE);
		}
	}
});

ygopro.ctos_follow_before("RESPONSE", false, async (buffer, info, client, server, datas) => { 
	var room = ROOM_all[client.rid];
	if (!room) {
		return;
	}
	if (client.is_using_pre_release) { 
		replace_buffer(buffer, room.list_pre_to_official, 0);
	}
});

ygopro.stoc_follow_before("GAME_MSG", false, async (buffer, info, client, server, datas) => { 
	var room = ROOM_all[client.rid];
	if (!room) {
		return;
	}
	if (client.is_using_pre_release) { 
		replace_buffer(buffer, room.list_official_to_pre, 1);
	}
});
