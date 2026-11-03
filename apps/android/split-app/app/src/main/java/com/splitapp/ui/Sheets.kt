package com.splitapp.ui

import android.app.Activity
import android.content.Intent
import android.provider.ContactsContract
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Remove
import androidx.compose.material.icons.outlined.Contacts
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CheckboxDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.RadioButton
import androidx.compose.material3.RadioButtonDefaults
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import com.splitapp.data.ME
import com.splitapp.data.Person
import com.splitapp.data.SplitMode
import com.splitapp.data.Store
import com.splitapp.parsePaise
import com.splitapp.rupees
import com.splitapp.ui.theme.AppTheme
import com.splitapp.ui.theme.LocalBoard
import com.splitapp.ui.theme.LocalBrand
import com.splitapp.ui.theme.accent
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.ui.graphics.Color
import com.splitapp.ui.theme.numerals

/** Change one person's share in the unit of the current split way: rupees, shares or percent. */
@Composable
fun AmountDialog(editor: SplitEditor, id: String, onClose: () -> Unit) {
    val line = editor.line(id) ?: return
    val ledger by Store.ledger.collectAsState()
    val name = if (id == ME) "Your" else "${ledger.person(id)?.name ?: "Their"}'s"
    val current = editor.outcome.amounts[id] ?: 0
    val initial = when (editor.mode) {
        SplitMode.EQUAL, SplitMode.EXACT -> rupees(current, symbol = false).replace(",", "")
        SplitMode.SHARES -> line.weight.toString()
        SplitMode.PERCENT -> "%.0f".format(line.percent)
    }
    var text by remember { mutableStateOf(initial) }
    val focus = remember { FocusRequester() }
    LaunchedEffect(Unit) { focus.requestFocus() }
    val unit = when (editor.mode) { SplitMode.EQUAL, SplitMode.EXACT -> "₹"; SplitMode.SHARES -> "shares"; SplitMode.PERCENT -> "%" }
    val valid = when (editor.mode) {
        SplitMode.EQUAL, SplitMode.EXACT -> parsePaise(text)?.let { it <= editor.totalPaise } == true
        SplitMode.SHARES -> text.toIntOrNull()?.let { it in 0..99 } == true
        SplitMode.PERCENT -> text.toDoubleOrNull()?.let { it in 0.0..100.0 } == true
    }
    // Dialogs sit on the standard Material surface so they read clearly over any brand colour.
    AppTheme { AlertDialog(
        onDismissRequest = onClose,
        title = { Text("$name share") },
        text = {
            Column {
                OutlinedTextField(
                    text, { text = it }, singleLine = true, isError = !valid,
                    prefix = if (editor.mode == SplitMode.EQUAL) ({ Text("₹") }) else null,
                    suffix = if (editor.mode != SplitMode.EQUAL) ({ Text(unit) }) else null,
                    textStyle = numerals(32),
                    keyboardOptions = KeyboardOptions(keyboardType = if (editor.mode == SplitMode.SHARES) KeyboardType.Number else KeyboardType.Decimal),
                    supportingText = {
                        Text(
                            when {
                                !valid && editor.mode == SplitMode.EQUAL -> "Enter an amount up to ${rupees(editor.totalPaise)}"
                                !valid -> "Enter a number between 0 and ${if (editor.mode == SplitMode.SHARES) 99 else 100}"
                                editor.mode == SplitMode.EQUAL -> "Everyone else rebalances to cover the rest"
                                else -> "Others keep their ${if (editor.mode == SplitMode.SHARES) "shares" else "percent"}"
                            },
                        )
                    },
                    modifier = Modifier.focusRequester(focus),
                )
            }
        },
        confirmButton = {
            TextButton(enabled = valid, onClick = {
                when (editor.mode) {
                    SplitMode.EQUAL, SplitMode.EXACT -> editor.setAmount(id, parsePaise(text))
                    SplitMode.SHARES -> editor.setWeight(id, text.toInt())
                    SplitMode.PERCENT -> editor.setPercent(id, text.toDouble())
                }
                onClose()
            }) { Text("Set") }
        },
        dismissButton = {
            if (editor.mode == SplitMode.EQUAL && line.fixedPaise != null) {
                TextButton({ editor.setAmount(id, null); onClose() }) { Text("Back to even") }
            } else TextButton(onClose) { Text("Cancel") }
        },
    ) }
}

/** The less common ways to split live here; equal split with tap-to-edit covers most payments. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SplitOptionsSheet(editor: SplitEditor, onClose: () -> Unit) {
    val b = LocalBoard.current
    ModalBottomSheet(onClose, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true), containerColor = Color(0xFF151716), contentColor = b.paint, shape = RoundedCornerShape(topStart = 32.dp, topEnd = 32.dp)) {
        Column(Modifier.padding(horizontal = 20.dp).padding(bottom = 24.dp).navigationBarsPadding()) {
            Text("Ways to split", style = MaterialTheme.typography.titleLarge, modifier = Modifier.padding(bottom = 8.dp))
            listOf(
                Triple(SplitMode.EQUAL, "Equally", "Everyone pays the same. Tap any amount to set it; the rest rebalance."),
                Triple(SplitMode.SHARES, "By shares", "Someone had two portions? Give them 2 shares."),
                Triple(SplitMode.PERCENT, "By percent", "Set each person's percent of the bill."),
            ).forEach { (mode, title, sub) ->
                Row(
                    Modifier.fillMaxWidth().selectable(editor.mode == mode, role = Role.RadioButton) { editor.changeMode(mode) }.padding(vertical = 10.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    RadioButton(editor.mode == mode, null, colors = RadioButtonDefaults.colors(selectedColor = b.plate, unselectedColor = b.paint))
                    Spacer(Modifier.width(12.dp))
                    Column { Text(title, style = MaterialTheme.typography.titleMedium); Text(sub, style = MaterialTheme.typography.bodySmall, color = b.muted) }
                }
            }
            if (editor.mode == SplitMode.SHARES) {
                HorizontalDivider(color = b.rule, modifier = Modifier.padding(vertical = 8.dp))
                ShareSteppers(editor)
            }
            HorizontalDivider(color = b.rule, modifier = Modifier.padding(vertical = 8.dp))
            Row(
                Modifier.fillMaxWidth().toggleable(editor.includesMe, role = Role.Switch) { editor.setIncludeMe(it) }.padding(vertical = 10.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column(Modifier.weight(1f)) {
                    Text("Include my share", style = MaterialTheme.typography.titleMedium)
                    Text("Turn off when it was bought for the others and you have no share.", style = MaterialTheme.typography.bodySmall, color = b.muted)
                }
                Switch(editor.includesMe, null, colors = SwitchDefaults.colors(checkedTrackColor = b.plate, checkedThumbColor = b.plateInk))
            }
            GhostPill("Reset to an even split", { editor.resetAll(); onClose() }, Modifier.fillMaxWidth().padding(top = 12.dp), board = b)
        }
    }
}

@Composable
private fun ShareSteppers(editor: SplitEditor) {
    val b = LocalBoard.current
    val ledger by Store.ledger.collectAsState()
    editor.lines.filter { it.included }.forEach { line ->
        Row(Modifier.fillMaxWidth().height(52.dp), verticalAlignment = Alignment.CenterVertically) {
            Text(if (line.personId == ME) "You" else ledger.person(line.personId)?.name ?: "", style = MaterialTheme.typography.bodyLarge, modifier = Modifier.weight(1f))
            IconButton({ editor.setWeight(line.personId, line.weight - 1) }, enabled = line.weight > 0) { Icon(Icons.Filled.Remove, "Fewer shares") }
            Text(line.weight.toString(), style = numerals(26), modifier = Modifier.width(32.dp), textAlign = androidx.compose.ui.text.style.TextAlign.Center)
            IconButton({ editor.setWeight(line.personId, line.weight + 1) }) { Icon(Icons.Filled.Add, "More shares", tint = b.paint) }
        }
    }
}

/** Edit a person's name and number, or take them off this split. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PersonSheet(editor: SplitEditor, person: Person?, onClose: () -> Unit) {
    if (person == null) { onClose(); return }
    val b = LocalBoard.current
    var name by remember { mutableStateOf(person.name) }
    var phone by remember { mutableStateOf(person.phone ?: "") }
    ModalBottomSheet(onClose, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true), containerColor = Color(0xFF151716), contentColor = b.paint, shape = RoundedCornerShape(topStart = 32.dp, topEnd = 32.dp)) {
        Column(Modifier.padding(horizontal = 20.dp).padding(bottom = 24.dp).navigationBarsPadding(), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Text("Edit person", style = MaterialTheme.typography.titleLarge)
            OutlinedTextField(name, { name = it }, label = { Text("Name") }, singleLine = true, modifier = Modifier.fillMaxWidth(), shape = WellShape, colors = wellColors(LocalBrand.current.accent))
            OutlinedTextField(
                phone, { phone = it }, label = { Text("Phone (for WhatsApp and SMS)") }, singleLine = true,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone), modifier = Modifier.fillMaxWidth(), shape = WellShape, colors = wellColors(LocalBrand.current.accent),
            )
            Text(
                if (person.onApp) "On Split. Expenses sync with them." else "Not on Split. This stays on your phone until you send a message.",
                style = MaterialTheme.typography.bodySmall, color = b.muted,
            )
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                GhostPill("Remove from split", { editor.remove(person.id); onClose() }, Modifier.weight(1f), board = b)
                PrimaryPill("Save", { Store.upsertPerson(person.copy(name = name.trim().ifBlank { person.name }, phone = phone.trim().ifBlank { null })); onClose() }, Modifier.weight(1f), board = b)
            }
        }
    }
}

/** Pick from people already in the ledger, from contacts, or type a name for someone not saved anywhere. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PeopleSheet(editor: SplitEditor, onClose: () -> Unit) {
    val b = LocalBoard.current
    val ctx = LocalContext.current
    val ledger by Store.ledger.collectAsState()
    var typed by remember { mutableStateOf("") }
    val pick = rememberLauncherForActivityResult(ActivityResultContracts.StartActivityForResult()) { res ->
        val uri = res.data?.data
        if (res.resultCode != Activity.RESULT_OK || uri == null) return@rememberLauncherForActivityResult
        ctx.contentResolver.query(
            uri, arrayOf(ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME, ContactsContract.CommonDataKinds.Phone.NUMBER), null, null, null,
        )?.use { c ->
            if (c.moveToFirst()) {
                val n = c.getString(0) ?: return@use
                val num = c.getString(1)
                val existing = ledger.people.firstOrNull { it.phone != null && it.phone.filter(Char::isDigit).takeLast(10) == num?.filter(Char::isDigit)?.takeLast(10) }
                val person = existing ?: Person(Store.newId(), n, num)
                Store.upsertPerson(person)
                editor.add(person.id)
            }
        }
    }
    ModalBottomSheet(onClose, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true), containerColor = Color(0xFF151716), contentColor = b.paint, shape = RoundedCornerShape(topStart = 32.dp, topEnd = 32.dp)) {
        Column(Modifier.padding(horizontal = 20.dp).padding(bottom = 24.dp).navigationBarsPadding().verticalScroll(rememberScrollState())) {
            Text("Who was in?", style = MaterialTheme.typography.titleLarge)
            // First the people already saved, so nobody gets added twice; then a clearly separate way to add someone new.
            if (ledger.people.isNotEmpty()) {
                SectionLabel("Your people", ledger.people.size, Modifier.padding(top = 16.dp))
                Text("Tick to add them. \"On Split\" means they use the app too, so it syncs.", style = MaterialTheme.typography.bodySmall, color = b.muted, modifier = Modifier.padding(bottom = 4.dp))
                ledger.people.sortedWith(compareByDescending<Person> { editor.line(it.id) != null }.thenByDescending { it.onApp }.thenBy { it.name }).forEach { p ->
                    val inSplit = editor.line(p.id) != null
                    Row(
                        Modifier.fillMaxWidth().height(56.dp).toggleable(inSplit, role = Role.Checkbox) { on -> if (on) editor.add(p.id) else editor.remove(p.id) },
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Checkbox(inSplit, null, colors = CheckboxDefaults.colors(checkedColor = b.plate, checkmarkColor = b.plateInk, uncheckedColor = b.paint))
                        Spacer(Modifier.width(8.dp))
                        Avatar(p.name, 32.dp)
                        Spacer(Modifier.width(12.dp))
                        Column(Modifier.weight(1f)) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Text(p.name, style = MaterialTheme.typography.bodyLarge)
                                if (p.onApp) OnSplitTag(Modifier.padding(start = 8.dp))
                            }
                            p.phone?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = b.muted) }
                        }
                    }
                }
            }
            SectionLabel("Someone new", modifier = Modifier.padding(top = 20.dp, bottom = 4.dp))
            GhostPill("Pick from contacts", { pick.launch(Intent(Intent.ACTION_PICK, ContactsContract.CommonDataKinds.Phone.CONTENT_URI)) }, Modifier.fillMaxWidth(), board = b)
            val same = sameAs(ledger, typed, "")
            Row(Modifier.padding(top = 12.dp), verticalAlignment = Alignment.CenterVertically) {
                OutlinedTextField(typed, { typed = it }, label = { Text("Or type a new name") }, singleLine = true, modifier = Modifier.weight(1f), shape = WellShape, colors = wellColors(LocalBrand.current.accent))
                Spacer(Modifier.width(8.dp))
                // A name already saved adds that person, never a second copy.
                PrimaryPill(if (same != null) "Add ${same.name.substringBefore(' ')}" else "Add", {
                    val id = same?.id ?: Person(Store.newId(), typed.trim()).also { Store.upsertPerson(it) }.id
                    editor.add(id); typed = ""
                }, enabled = typed.isNotBlank(), board = b)
            }
            Text(
                if (same != null) "${same.name} is already saved, so Add ticks them." else "They don't need the app. It stays on your phone until you send a reminder.",
                style = MaterialTheme.typography.bodySmall, color = b.muted, modifier = Modifier.padding(top = 6.dp, bottom = 8.dp),
            )
            PrimaryPill("Done", onClose, Modifier.fillMaxWidth().padding(top = 16.dp), board = b)
        }
    }
}

@Composable
fun GroupNameDialog(onSave: (String) -> Unit, onClose: () -> Unit) {
    var name by remember { mutableStateOf("") }
    AppTheme { AlertDialog(
        onDismissRequest = onClose,
        title = { Text("Name this group") },
        text = { OutlinedTextField(name, { name = it }, placeholder = { Text("Flat 302, Sunday football…") }, singleLine = true) },
        confirmButton = { TextButton({ onSave(name.trim()) }, enabled = name.isNotBlank()) { Text("Save group") } },
        dismissButton = { TextButton(onClose) { Text("Cancel") } },
    ) }
}

@Composable
fun UpiField(value: String, onChange: (String) -> Unit, onSave: () -> Unit) {
    val b = LocalBoard.current
    val ok = Regex("^[\\w.\\-]{2,}@[a-zA-Z]{2,}$").matches(value.trim())
    // Field, then its hint, then the action: each on its own line, with room between them.
    Column(Modifier.padding(top = Space.m)) {
        OutlinedTextField(
            value, onChange, label = { Text("Your UPI ID") }, placeholder = { Text("name@okhdfc") }, singleLine = true,
            modifier = Modifier.fillMaxWidth(), shape = WellShape, colors = wellColors(b.paint),
        )
        Text(
            "Goes into every reminder, so a friend can pay you in two taps.",
            style = MaterialTheme.typography.bodySmall, color = b.muted, modifier = Modifier.padding(start = Space.xs, top = Space.s, bottom = Space.l),
        )
        PrimaryPill("Save UPI ID", onSave, Modifier.fillMaxWidth(), enabled = ok, board = b)
    }
}