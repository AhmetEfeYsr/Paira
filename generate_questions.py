import json
import hashlib

def create_question(id, category, main_entity, question_text, correct_answer, wrong1, wrong2, wrong3, difficulty):
    q_hash = hashlib.sha256(f"{id}{category}{main_entity}".encode()).hexdigest()
    return {
        "id": id,
        "category": category,
        "main_entity": main_entity,
        "question_hash": q_hash,
        "question_text": question_text,
        "correct_answer": correct_answer,
        "wrong1": wrong1,
        "wrong2": wrong2,
        "wrong3": wrong3,
        "quality_score": 0,
        "is_active": True,
        "difficulty": difficulty
    }

questions = [
    create_question(19, "Tarih", "ataturk", "Türkiye Cumhuriyeti'nin kurucusu kimdir?", "Mustafa Kemal Atatürk", "İsmet İnönü", "Fevzi Çakmak", "Kazım Karabekir", 10),
    create_question(20, "Coğrafya", "nil", "Dünyanın en uzun nehri hangisidir?", "Nil Nehri", "Amazon Nehri", "Yangtze Nehri", "Mississippi Nehri", 30),
    create_question(21, "Bilim", "oksijen", "İnsan vücudunda en çok bulunan element hangisidir?", "Oksijen", "Karbon", "Hidrojen", "Kalsiyum", 50),
    create_question(22, "Sanat", "mona_lisa", "Mona Lisa tablosu hangi ressama aittir?", "Leonardo da Vinci", "Pablo Picasso", "Vincent van Gogh", "Michelangelo", 20),
    create_question(23, "Edebiyat", "suç_ve_ceza", "'Suç ve Ceza' romanının yazarı kimdir?", "Fyodor Dostoyevski", "Lev Tolstoy", "Anton Çehov", "Aleksandr Puşkin", 40),
    create_question(24, "Spor", "olimpiyat", "Olimpiyat halkaları kaç tanedir?", "5", "4", "6", "7", 10),
    create_question(25, "Genel Kültür", "pi", "Matematikte 'Pi' sayısının yaklaşık değeri kaçtır?", "3.14", "3.16", "3.12", "3.18", 15),
    create_question(26, "Tarih", "ikinci_dunya_savasi", "İkinci Dünya Savaşı hangi yıl sona ermiştir?", "1945", "1939", "1918", "1941", 35),
    create_question(27, "Coğrafya", "avustralya", "Hem bir kıta hem de bir ülke olan yer hangisidir?", "Avustralya", "Grönland", "Madagaskar", "Yeni Zelanda", 25),
    create_question(28, "Bilim", "isik_hizi", "Işık hızı saniyede yaklaşık kaç kilometredir?", "300.000", "150.000", "500.000", "1.000.000", 60),
    create_question(29, "Müzik", "beethoven", "Dokuzuncu Senfoni'nin bestecisi kimdir?", "Ludwig van Beethoven", "Wolfgang Amadeus Mozart", "Johann Sebastian Bach", "Frédéric Chopin", 45),
    create_question(30, "Sinema", "titanic", "1997 yapımı 'Titanik' filminin yönetmeni kimdir?", "James Cameron", "Steven Spielberg", "Christopher Nolan", "Martin Scorsese", 30),
    create_question(31, "Tarih", "roma", "Roma İmparatorluğu'nun ilk imparatoru kimdir?", "Augustus", "Jül Sezar", "Nero", "Caligula", 70),
    create_question(32, "Coğrafya", "sahra", "Dünyanın en büyük sıcak çölü hangisidir?", "Sahra Çölü", "Gobi Çölü", "Kalahari Çölü", "Arap Çölü", 20),
    create_question(33, "Bilim", "dna", "DNA'nın açılımı nedir?", "Deoksiribonükleik asit", "Dioribonükleik asit", "Deoksiribonötral asit", "Dinükleik asit", 55),
    create_question(34, "Edebiyat", "nutuk", "Atatürk'ün kaleme aldığı, Kurtuluş Savaşı'nı anlatan eserin adı nedir?", "Nutuk", "Zeytindağı", "Tek Adam", "Çankaya", 15),
    create_question(35, "Spor", "basketbol", "Basketbolda bir periyot NBA'de kaç dakikadır?", "12", "10", "15", "8", 40),
    create_question(36, "Genel Kültür", "satranc", "Satranç tahtasında toplam kaç kare vardır?", "64", "100", "81", "49", 25),
    create_question(37, "Tarih", "fransiz_ihtilali", "Fransız İhtilali hangi yıl gerçekleşmiştir?", "1789", "1799", "1804", "1776", 65),
    create_question(38, "Coğrafya", "pasifik", "Dünyanın en büyük okyanusu hangisidir?", "Pasifik Okyanusu", "Atlantik Okyanusu", "Hint Okyanusu", "Arktik Okyanusu", 10),
    create_question(39, "Bilim", "altin", "Altının kimyasal sembolü nedir?", "Au", "Ag", "Fe", "Cu", 35),
    create_question(40, "Sanat", "picasso", "Kübizm akımının öncülerinden olan İspanyol ressam kimdir?", "Pablo Picasso", "Salvador Dalí", "Joan Miró", "Diego Velázquez", 50),
    create_question(41, "Edebiyat", "yuzuklerin_efendisi", "'Yüzüklerin Efendisi' serisinin yazarı kimdir?", "J.R.R. Tolkien", "J.K. Rowling", "George R.R. Martin", "C.S. Lewis", 20),
    create_question(42, "Spor", "tenis", "Teniste 'Grand Slam' turnuvaları kaç tanedir?", "4", "3", "5", "6", 45),
    create_question(43, "Genel Kültür", "lego", "Lego oyuncakları hangi ülkeye aittir?", "Danimarka", "İsveç", "Almanya", "İsviçre", 55),
    create_question(44, "Tarih", "osmanli", "Osmanlı Devleti'nin kurucusu kimdir?", "Osman Gazi", "Orhan Gazi", "Ertuğrul Gazi", "Fatih Sultan Mehmet", 10),
    create_question(45, "Coğrafya", "ankara", "Türkiye'nin başkenti neresidir?", "Ankara", "İstanbul", "İzmir", "Bursa", 5),
    create_question(46, "Bilim", "su", "Suyun kimyasal formülü nedir?", "H2O", "CO2", "O2", "NaCl", 5),
    create_question(47, "Müzik", "gitar", "Gitarın genellikle kaç teli vardır?", "6", "4", "5", "7", 15),
    create_question(48, "Sinema", "matrix", "'Matrix' filminde Neo karakterini hangi aktör canlandırmıştır?", "Keanu Reeves", "Tom Cruise", "Brad Pitt", "Will Smith", 25)
]

with open('BilgiYarismasi/tr.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

data.extend(questions)

with open('BilgiYarismasi/tr.json', 'w', encoding='utf-8') as f:
    json.dump(data, f, ensure_ascii=False, indent=4)

print("30 sorular başarıyla eklendi.")
