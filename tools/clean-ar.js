const fs = require("fs");

let path = "apps/jitpluspro/i18n/locales/ar.ts";
let content = fs.readFileSync(path, "utf8");

let replacements = {
    "سحوبات التمبولا": "سحوبات العجلة",
    "أرباح التمبولا": "أرباح العجلة",
    "تمبولا نشيطة": "لعبة نشيطة",
    "التمبولا خدامة! الزبون خاصو يصرف على الأقل %{amount} درهم باش ياخد تذكرة (اختياري).": "اللعبة خدامة! الزبون خاصو يصرف على الأقل %{amount} درهم باش ياخد فرصة (اختياري).",
    "ما كاين تذكرة تمبولا (الحد الأدنى %{amount} درهم). التامبون غادي يتأكد.": "ما كاين فرصة (الحد الأدنى %{amount} درهم). التامبون غادي يتأكد.",
    "الزبون مؤهل لتذكرة التمبولا!": "الزبون مؤهل لفرصة!",
    "تذكرة تمبولا": "فرصة",
    "تمبولا": "لعبة",
    "التمبولا": "اللعبة",
    "حملة": "لعبة",
    "الحملات": "الألعاب",
    "التذاكر": "الفرص",
    "تذكرة": "فرصة"
};

for (const [key, value] of Object.entries(replacements)) {
    content = content.split(key).join(value);
}

fs.writeFileSync(path, content, "utf8");
console.log("Arabic translated successfully in jitpluspro.");

path = "apps/jitplus/i18n/locales/ar.ts";
if (fs.existsSync(path)) {
    content = fs.readFileSync(path, "utf8");
    let jitplusReplacements = {
        "حملة": "لعبة",
        "تيكي": "فرصة"
    };
    for (const [key, value] of Object.entries(jitplusReplacements)) {
        content = content.split(key).join(value);
    }
    fs.writeFileSync(path, content, "utf8");
    console.log("Arabic translated successfully in jitplus.");
}
