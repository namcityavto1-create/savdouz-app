/* SavdoUz i18n — o'zbek (asosiy) / rus / turk.
 * Ilova kodi o'zgarmaydi: matnlar sahifaga chiqqach shu fayl tarjima qiladi.
 * Til: localStorage 'savdouz_lang' = uz | ru | tr
 */
(function () {
  'use strict';
  var LANGS = { uz: "O\u2018zbekcha", ru: '\u0420\u0443\u0441\u0441\u043a\u0438\u0439', tr: 'T\u00fcrk\u00e7e' };
  var lang = 'uz';
  try { lang = localStorage.getItem('savdouz_lang') || 'uz'; } catch (e) {}
  if (!LANGS[lang]) lang = 'uz';

  // [uz, ru, tr]
  var D = [
    // ---- Kirish / ro'yxat ----
    ['Yangi hisob yarating', 'Создайте новый аккаунт', 'Yeni hesap oluşturun'],
    ['Hisobingizga kiring', 'Войдите в аккаунт', 'Hesabınıza giriş yapın'],
    ['Xaridor', 'Покупатель', 'Alıcı'],
    ['Sotuvchi', 'Продавец', 'Satıcı'],
    ['Ism', 'Имя', 'Ad'],
    ['Ismingiz', 'Ваше имя', 'Adınız'],
    ['Pasport yoki ID karta rasmi', 'Фото паспорта или ID-карты', 'Pasaport veya kimlik kartı fotoğrafı'],
    ["Selfi (o'zingizning rasmingiz)", 'Селфи (ваше фото)', 'Selfie (kendi fotoğrafınız)'],
    ["Admin rasmlaringizni tekshirib, hisobingizni tasdiqlaydi. Tasdiqlangunga qadar mahsulot qo'sha olmaysiz.", 'Администратор проверит ваши фото и подтвердит аккаунт. До подтверждения вы не сможете добавлять товары.', 'Yönetici fotoğraflarınızı kontrol edip hesabınızı onaylayacak. Onaylanana kadar ürün ekleyemezsiniz.'],
    ['Telefon raqam', 'Номер телефона', 'Telefon numarası'],
    ['Parol', 'Пароль', 'Şifre'],
    ["Ro'yxatdan o'tish", 'Регистрация', 'Kayıt ol'],
    ['Kirish', 'Войти', 'Giriş yap'],
    ['Hisobingiz bormi?', 'Уже есть аккаунт?', 'Hesabınız var mı?'],
    ["Hisobingiz yo'qmi?", 'Нет аккаунта?', 'Hesabınız yok mu?'],
    ['Kiring', 'Войдите', 'Giriş yapın'],
    ["Ro'yxatdan o'ting", 'Зарегистрируйтесь', 'Kayıt olun'],
    ['Chiqish', 'Выйти', 'Çıkış'],
    ['Ismingizni kiriting', 'Введите ваше имя', 'Adınızı girin'],
    ['Pasport yoki ID karta va selfi rasmini yuklang', 'Загрузите фото паспорта или ID-карты и селфи', 'Pasaport veya kimlik kartı ile selfie fotoğrafı yükleyin'],
    ['Telefon raqam yoki parol xato', 'Неверный номер телефона или пароль', 'Telefon numarası veya şifre hatalı'],
    ["Bu raqam allaqachon ro'yxatdan o'tgan", 'Этот номер уже зарегистрирован', 'Bu numara zaten kayıtlı'],
    ["Barcha maydonlarni to'ldiring", 'Заполните все поля', 'Tüm alanları doldurun'],
    ['Sessiya tugadi, qaytadan kiring', 'Сессия истекла, войдите снова', 'Oturum sona erdi, tekrar giriş yapın'],

    // ---- Tarmoq / umumiy xatolar ----
    ['Server javob bermadi (vaqt tugadi)', 'Сервер не отвечает (время истекло)', 'Sunucu yanıt vermedi (zaman aşımı)'],
    ["Server bilan aloqa yo'q", 'Нет связи с сервером', 'Sunucu ile bağlantı yok'],
    ["Serverdan noto'g'ri javob", 'Неверный ответ сервера', 'Sunucudan geçersiz yanıt'],
    ['Server xatosi', 'Ошибка сервера', 'Sunucu hatası'],
    ['Tizimga kirilmagan', 'Вы не вошли в систему', 'Giriş yapılmadı'],
    ["Ruxsat yo'q", 'Нет доступа', 'Erişim yok'],
    ["Noto'g'ri so'rov", 'Неверный запрос', 'Geçersiz istek'],
    ["Rasmni o'qib bo'lmadi", 'Не удалось прочитать изображение', 'Görsel okunamadı'],
    ["Rasm formati noto'g'ri", 'Неверный формат изображения', 'Görsel biçimi geçersiz'],
    ["Rasmni yuklab bo'lmadi", 'Не удалось загрузить изображение', 'Görsel yüklenemedi'],
    ['Yuklanmoqda...', 'Загрузка...', 'Yükleniyor...'],
    ['Qayta urinish', 'Повторить', 'Tekrar dene'],
    ['← Orqaga', '← Назад', '← Geri'],
    ['Bajarildi ✅', 'Готово ✅', 'Tamamlandı ✅'],

    // ---- Navigatsiya ----
    ['Bosh sahifa', 'Главная', 'Ana sayfa'],
    ['Sevimlilar', 'Избранное', 'Favoriler'],
    ['Savat', 'Корзина', 'Sepet'],
    ['Profil', 'Профиль', 'Profil'],
    ['Mahsulotlarim', 'Мои товары', 'Ürünlerim'],
    ['Buyurtmalar', 'Заказы', 'Siparişler'],
    ["Qo'shish", 'Добавить', 'Ekle'],
    ["To'lov", 'Оплата', 'Ödeme'],
    ['Sotuvchilar', 'Продавцы', 'Satıcılar'],
    ['Mahsulotlar', 'Товары', 'Ürünler'],
    ['Xaridorlar', 'Покупатели', 'Alıcılar'],
    ["To'lovlar", 'Платежи', 'Ödemeler'],
    ['Admin', 'Админ', 'Yönetici'],
    ['Administrator', 'Администратор', 'Yönetici'],

    // ---- Kategoriyalar ----
    ['Barchasi', 'Все', 'Hepsi'],
    ['Telefon', 'Телефон', 'Telefon'],
    ['Kompyuter', 'Компьютеры', 'Bilgisayar'],
    ['Elektronika', 'Электроника', 'Elektronik'],
    ['Maishiy texnika', 'Бытовая техника', 'Ev aletleri'],
    ['Kiyim', 'Одежда', 'Giyim'],
    ['Poyabzal', 'Обувь', 'Ayakkabı'],
    ['Aksessuarlar', 'Аксессуары', 'Aksesuarlar'],
    ["Go'zallik", 'Красота', 'Güzellik'],
    ['Oziq-ovqat', 'Продукты', 'Gıda'],
    ["Uy-ro'zg'or", 'Для дома', 'Ev eşyaları'],
    ['Mebel', 'Мебель', 'Mobilya'],
    ['Bolalar', 'Детям', 'Çocuk'],
    ['Sport', 'Спорт', 'Spor'],
    ['Avto', 'Авто', 'Oto'],
    ['Qurilish', 'Стройматериалы', 'İnşaat'],
    ['Kitob', 'Книги', 'Kitap'],
    ['Boshqa', 'Другое', 'Diğer'],

    // ---- Viloyatlar ----
    ['Toshkent shahri', 'город Ташкент', 'Taşkent şehri'],
    ['Toshkent viloyati', 'Ташкентская область', 'Taşkent vilayeti'],
    ['Andijon', 'Андижан', 'Andican'],
    ["Farg'ona", 'Фергана', 'Fergana'],
    ['Namangan', 'Наманган', 'Namangan'],
    ['Buxoro', 'Бухара', 'Buhara'],
    ['Jizzax', 'Джизак', 'Cizzah'],
    ['Qashqadaryo', 'Кашкадарья', 'Kaşkaderya'],
    ['Navoiy', 'Навои', 'Navoi'],
    ['Samarqand', 'Самарканд', 'Semerkant'],
    ['Sirdaryo', 'Сырдарья', 'Siriderya'],
    ['Surxondaryo', 'Сурхандарья', 'Surhanderya'],
    ['Xorazm', 'Хорезм', 'Harezm'],
    ["Qoraqalpog'iston", 'Каракалпакстан', 'Karakalpakistan'],

    // ---- Bosh sahifa / mahsulot ----
    ['Mahsulot qidirish...', 'Поиск товаров...', 'Ürün ara...'],
    ['Odatiy', 'По умолчанию', 'Varsayılan'],
    ['Arzon→Qimmat', 'Дешёвые → дорогие', 'Ucuz → pahalı'],
    ['Qimmat→Arzon', 'Дорогие → дешёвые', 'Pahalı → ucuz'],
    ['Reyting', 'Рейтинг', 'Puan'],
    ['Hech narsa topilmadi', 'Ничего не найдено', 'Hiçbir şey bulunamadı'],
    ["Bu kategoriyada mahsulot yo'q", 'В этой категории нет товаров', 'Bu kategoride ürün yok'],
    ["Hozircha mahsulot yo'q", 'Пока нет товаров', 'Henüz ürün yok'],
    ["Hali sharh yo'q", 'Отзывов пока нет', 'Henüz yorum yok'],
    ["SavdoUz'da minglab mahsulot — ishonchli sotuvchilardan", 'Тысячи товаров на SavdoUz — от надёжных продавцов', "SavdoUz'da binlerce ürün — güvenilir satıcılardan"],
    ['Hammasi ›', 'Все ›', 'Hepsi ›'],
    ["‹ Yig'ish", '‹ Свернуть', '‹ Daralt'],
    ['⭐ Top', '⭐ Топ', '⭐ Popüler'],
    ['✨ Yangi', '✨ Новинка', '✨ Yeni'],
    ['Yangi', 'Новый', 'Yeni'],
    ['Tugagan', 'Нет в наличии', 'Tükendi'],
    ['Omborda', 'В наличии', 'Stokta'],
    ['Omborda shuncha bor', 'Больше нет в наличии', 'Stokta bu kadar var'],
    ['Savatga qo\'shish', 'В корзину', 'Sepete ekle'],
    ['🚫 Yetkazib berish yo\'q', '🚫 Доставки нет', '🚫 Teslimat yok'],
    ['Bepul', 'Бесплатно', 'Ücretsiz'],
    ['Barcha viloyatlarga', 'Во все области', 'Tüm vilayetlere'],
    ['🔥 Hafta chegirmasi', '🔥 Скидка недели', '🔥 Haftanın indirimi'],
    ['kun qoldi', 'дн. осталось', 'gün kaldı'],
    ["Sevimlilarga qo'shildi ❤️", 'Добавлено в избранное ❤️', 'Favorilere eklendi ❤️'],
    ['Sevimlilardan olib tashlandi', 'Удалено из избранного', 'Favorilerden çıkarıldı'],
    ["Hali sevimli mahsulot yo'q", 'В избранном пока ничего нет', 'Henüz favori ürün yok'],
    ['Baho qo\'ying', 'Оцените', 'Puan verin'],
    ['yulduz ✅', 'звёзд ✅', 'yıldız ✅'],
    ['Reklama', 'Реклама', 'Reklam'],
    ['Batafsil ›', 'Подробнее ›', 'Detay ›'],
    ["📢 Bu yerda sizning reklamangiz bo'lishi mumkin", '📢 Здесь может быть ваша реклама', '📢 Reklamınız burada olabilir'],
    ["Reklama joylash uchun biz bilan bog'laning", 'Для размещения рекламы свяжитесь с нами', 'Reklam vermek için bizimle iletişime geçin'],
    ["Bog'lanish", 'Связаться', 'İletişim'],

    // ---- Savat / buyurtma berish ----
    ["Savatingiz bo'sh", 'Ваша корзина пуста', 'Sepetiniz boş'],
    ["Savat bo'sh", 'Корзина пуста', 'Sepet boş'],
    ['Xarid qilish', 'К покупкам', 'Alışverişe başla'],
    ['Yetkazib berish viloyati', 'Область доставки', 'Teslimat vilayeti'],
    ['Viloyatni tanlang', 'Выберите область', 'Vilayet seçin'],
    ['Yetkazib berish manzili', 'Адрес доставки', 'Teslimat adresi'],
    ["Shahar, ko'cha, uy", 'Город, улица, дом', 'Şehir, sokak, bina'],
    ['Yetkazib berish', 'Доставка', 'Teslimat'],
    ['🚚 Yetkazib berish', '🚚 Доставка', '🚚 Teslimat'],
    ['Jami', 'Итого', 'Toplam'],
    ["To'lov usuli", 'Способ оплаты', 'Ödeme yöntemi'],
    ['💵 Naqd (yetkazishda)', '💵 Наличными (при доставке)', '💵 Nakit (teslimatta)'],
    ['💳 Karta orqali (sotuvchi kartasiga)', '💳 Картой (на карту продавца)', '💳 Kart ile (satıcının kartına)'],
    ['💵 Naqd', '💵 Наличные', '💵 Nakit'],
    ["Buyurtmadan keyin Profil → «Buyurtmalarim» bo'limida sotuvchi kartasi ko'rinadi va chekni yuklaysiz.", 'После заказа в разделе Профиль → «Мои заказы» появится карта продавца, и вы загрузите чек.', 'Siparişten sonra Profil → «Siparişlerim» bölümünde satıcının kartı görünür ve dekontu yüklersiniz.'],
    ['Buyurtma berish', 'Оформить заказ', 'Sipariş ver'],
    ["Ba'zi mahsulotlar shu hududga yetkazilmaydi", 'Некоторые товары не доставляются в этот регион', 'Bazı ürünler bu bölgeye teslim edilmiyor'],
    ['Manzilni kiriting', 'Введите адрес', 'Adresi girin'],
    ['Yetkazib berish viloyatini tanlang', 'Выберите область доставки', 'Teslimat vilayetini seçin'],
    ['Buyurtma qabul qilindi! ✅', 'Заказ принят! ✅', 'Sipariş alındı! ✅'],
    ["Qabul qilindi! «Buyurtmalarim»da chekni yuklang 🧾", 'Принято! Загрузите чек в «Моих заказах» 🧾', 'Alındı! «Siparişlerim»de dekontu yükleyin 🧾'],
    ['Saqlangan manzil', 'Сохранённый адрес', 'Kayıtlı adres'],
    ["Hozircha saqlangan manzil yo'q", 'Сохранённого адреса пока нет', 'Henüz kayıtlı adres yok'],
    ["Manzilni o'chirish", 'Удалить адрес', 'Adresi sil'],
    ["Manzil o'chirildi", 'Адрес удалён', 'Adres silindi'],

    // ---- Buyurtmalar (xaridor) ----
    ["Hali buyurtmalar yo'q", 'Заказов пока нет', 'Henüz sipariş yok'],
    ['Buyurtmalarim', 'Мои заказы', 'Siparişlerim'],
    ['❌ Buyurtma bekor qilindi', '❌ Заказ отменён', '❌ Sipariş iptal edildi'],
    ['Kuryerda', 'У курьера', 'Kuryede'],
    ['Tasdiqlandi', 'Подтверждён', 'Onaylandı'],
    ['Yetkazildi', 'Доставлен', 'Teslim edildi'],
    ['⏳ Chek kutilmoqda', '⏳ Ожидается чек', '⏳ Dekont bekleniyor'],
    ['🧾 Chek tekshirilmoqda', '🧾 Чек проверяется', '🧾 Dekont kontrol ediliyor'],
    ['✅ To\'lov tasdiqlandi', '✅ Оплата подтверждена', '✅ Ödeme onaylandı'],
    ["To'lov tasdiqlandi ✅", 'Оплата подтверждена ✅', 'Ödeme onaylandı ✅'],
    ["To'lov rad etildi", 'Оплата отклонена', 'Ödeme reddedildi'],
    ['Chek yoki skrinshot yuklang', 'Загрузите чек или скриншот', 'Dekont veya ekran görüntüsü yükleyin'],
    ['Chek yuborilmoqda...', 'Отправка чека...', 'Dekont gönderiliyor...'],
    ['Chek yuborildi, sotuvchi tasdiqlaydi ✅', 'Чек отправлен, продавец подтвердит ✅', 'Dekont gönderildi, satıcı onaylayacak ✅'],
    ['✅ Mahsulotni oldim', '✅ Я получил товар', '✅ Ürünü aldım'],
    ['Tasdiqlash uchun yana bosing', 'Нажмите ещё раз для подтверждения', 'Onaylamak için tekrar basın'],
    ['Rahmat! Buyurtma yetkazildi ✅', 'Спасибо! Заказ доставлен ✅', 'Teşekkürler! Sipariş teslim edildi ✅'],
    ['💬 Xabarlar', '💬 Сообщения', '💬 Mesajlar'],
    ['Xabar yozing...', 'Напишите сообщение...', 'Mesaj yazın...'],
    ["Hali xabar yo'q", 'Сообщений пока нет', 'Henüz mesaj yok'],
    ["Tasdiqlansa shu yerda xabar chiqadi.", 'Если подтвердят, здесь появится сообщение.', 'Onaylanırsa burada mesaj çıkar.'],
    ['Kutilmoqda', 'Ожидает', 'Bekliyor'],

    // ---- Bildirishnomalar ----
    ['Bildirishnomalar', 'Уведомления', 'Bildirimler'],
    ["Hozircha bildirishnoma yo'q", 'Уведомлений пока нет', 'Henüz bildirim yok'],
    ['Buyurtmangiz qabul qilindi', 'Ваш заказ принят', 'Siparişiniz alındı'],
    ['Sotuvchi buyurtmangizni tasdiqladi', 'Продавец подтвердил ваш заказ', 'Satıcı siparişinizi onayladı'],
    ['Buyurtmangiz kuryerga topshirildi', 'Ваш заказ передан курьеру', 'Siparişiniz kuryeye teslim edildi'],
    ['Buyurtmangiz yetkazildi', 'Ваш заказ доставлен', 'Siparişiniz teslim edildi'],
    ['Buyurtmangiz bekor qilindi', 'Ваш заказ отменён', 'Siparişiniz iptal edildi'],
    ['Yangi buyurtma', 'Новый заказ', 'Yeni sipariş'],
    ['Buyurtmani tasdiqladingiz', 'Вы подтвердили заказ', 'Siparişi onayladınız'],
    ['Kuryerga topshirildi', 'Передан курьеру', 'Kuryeye teslim edildi'],
    ['Buyurtma yetkazildi', 'Заказ доставлен', 'Sipariş teslim edildi'],
    ['Buyurtma bekor qilindi', 'Заказ отменён', 'Sipariş iptal edildi'],
    ['Hisobingiz tasdiqlandi ✅', 'Ваш аккаунт подтверждён ✅', 'Hesabınız onaylandı ✅'],

    // ---- Profil / sozlamalar ----
    ['Ilova tili', 'Язык приложения', 'Uygulama dili'],
    ["O'zbekcha", 'Русский', 'Türkçe'],
    ["Ma'lumotnoma", 'Справка', 'Yardım'],
    ["Biz bilan bog'lanish", 'Связаться с нами', 'Bize ulaşın'],
    ["Sotuvchi bo'lish", 'Стать продавцом', 'Satıcı ol'],
    ['Sozlamalar', 'Настройки', 'Ayarlar'],
    ['Mening hisobim', 'Мой счёт', 'Hesabım'],
    ['Reklamalar', 'Реклама', 'Reklamlar'],
    ['tasdiqlangan', 'подтверждён', 'onaylı'],
    ['tasdiqlanish kutilmoqda', 'ожидает подтверждения', 'onay bekliyor'],
    ['rad etilgan', 'отклонён', 'reddedildi'],
    ['Sotuvchi hisobi alohida ochiladi. Hozirgi hisobdan chiqib, sotuvchi sifatida ro\'yxatdan o\'tasizmi?', 'Аккаунт продавца создаётся отдельно. Выйти из текущего аккаунта и зарегистрироваться как продавец?', 'Satıcı hesabı ayrı açılır. Mevcut hesaptan çıkıp satıcı olarak kayıt olmak ister misiniz?'],
    ['Hisobdan chiqasizmi?', 'Выйти из аккаунта?', 'Hesaptan çıkmak istiyor musunuz?'],
    ['Hisobingiz hali tasdiqlanmagan', 'Ваш аккаунт ещё не подтверждён', 'Hesabınız henüz onaylanmadı'],
    ['Ilova versiyasi', 'Версия приложения', 'Uygulama sürümü'],
    ['Ilova versiyasi:', 'Версия приложения:', 'Uygulama sürümü:'],
    ['Rol', 'Роль', 'Rol'],
    ['Holat', 'Статус', 'Durum'],
    ["Ko'rinish", 'Оформление', 'Görünüm'],
    ['Tasdiqlangan', 'Подтверждён', 'Onaylı'],
    ['Rad etilgan', 'Отклонён', 'Reddedildi'],
    ['yangi', 'новый', 'yeni'],
    ['tasdiqlandi', 'подтверждён', 'onaylandı'],
    ['kuryerga topshirildi', 'передан курьеру', 'kuryeye teslim edildi'],
    ['bekor qilindi', 'отменён', 'iptal edildi'],
    ['yetkazildi', 'доставлен', 'teslim edildi'],
    ['rad etildi', 'отклонено', 'reddedildi'],
    ['chek yuborildi', 'чек отправлен', 'dekont gönderildi'],
    ['kutilmoqda', 'ожидает', 'bekliyor'],
    ["Yorug'", 'Светлая', 'Açık'],
    ["Qorong'u", 'Тёмная', 'Koyu'],
    ['Telegram bot', 'Telegram-бот', 'Telegram botu'],
    ["Savol, taklif yoki muammoingizni to'g'ridan-to'g'ri Telegram orqali shu botga yozing.", 'Напишите свой вопрос, предложение или проблему прямо этому боту в Telegram.', 'Sorunuzu, önerinizi veya sorununuzu doğrudan Telegram üzerinden bu bota yazın.'],

    // ---- Ma'lumotnoma (FAQ) ----
    ["Qanday buyurtma beraman?", 'Как оформить заказ?', 'Nasıl sipariş veririm?'],
    ["Mahsulotni savatga qo'shing, Savat bo'limida viloyat va manzilni kiriting, so'ng «Buyurtma berish» tugmasini bosing.", 'Добавьте товар в корзину, в разделе «Корзина» укажите область и адрес, затем нажмите «Оформить заказ».', 'Ürünü sepete ekleyin, Sepet bölümünde vilayet ve adresi girin, ardından «Sipariş ver» düğmesine basın.'],
    ["To'lovni qanday qilaman?", 'Как оплатить?', 'Ödemeyi nasıl yaparım?'],
    ["Naqd to'lov mahsulotni olganingizda amalga oshadi. Karta orqali to'lasangiz, Profil → Buyurtmalarim bo'limida sotuvchi kartasi ko'rinadi. Pulni o'tkazib, chek rasmini shu yerda yuklaysiz.", 'Наличный расчёт — при получении товара. Если платите картой, в разделе Профиль → Мои заказы будет видна карта продавца. Переведите деньги и загрузите фото чека там же.', 'Nakit ödeme ürünü teslim aldığınızda yapılır. Kartla öderseniz Profil → Siparişlerim bölümünde satıcının kartı görünür. Parayı gönderip dekont fotoğrafını orada yüklersiniz.'],
    ["Buyurtma holatini qayerda ko'raman?", 'Где посмотреть статус заказа?', 'Sipariş durumunu nerede görürüm?'],
    ["Profil → Buyurtmalarim va Bildirishnomalar bo'limlarida.", 'В разделах Профиль → Мои заказы и Уведомления.', 'Profil → Siparişlerim ve Bildirimler bölümlerinde.'],
    ["Mahsulotni olganimni qanday tasdiqlayman?", 'Как подтвердить получение товара?', 'Ürünü aldığımı nasıl onaylarım?'],
    ["Sotuvchi buyurtmani kuryerga topshirgach, Buyurtmalarim bo'limida «Mahsulotni oldim» tugmasi paydo bo'ladi.", 'Когда продавец передаст заказ курьеру, в разделе «Мои заказы» появится кнопка «Я получил товар».', 'Satıcı siparişi kuryeye teslim edince Siparişlerim bölümünde «Ürünü aldım» düğmesi görünür.'],
    ['Yetkazib berish narxi qancha?', 'Сколько стоит доставка?', 'Teslimat ücreti ne kadar?'],
    ["Narx har bir mahsulot kartasida ko'rsatilgan. Savatda viloyatni tanlasangiz, jami narx hisoblanadi.", 'Цена указана на карточке каждого товара. Выберите область в корзине — и итог посчитается автоматически.', 'Fiyat her ürün kartında gösterilir. Sepette vilayeti seçtiğinizde toplam hesaplanır.'],
    ["Baho va sharh qoldirsam bo'ladimi?", 'Можно ли оставить оценку и отзыв?', 'Puan ve yorum bırakabilir miyim?'],
    ["Ha. Sotib olgan mahsulotingiz uchun Buyurtmalarim bo'limida yulduzcha bosib baho qo'ying.", 'Да. Для купленного товара поставьте оценку звёздочкой в разделе «Мои заказы».', 'Evet. Satın aldığınız ürün için Siparişlerim bölümünde yıldıza basarak puan verin.'],
    ["Mahsulotni qanday qo'shaman?", 'Как добавить товар?', 'Ürünü nasıl eklerim?'],
    ["«Qo'shish» bo'limida rasm, nom, narx va sonini kiriting. Hisobingiz admin tomonidan tasdiqlangan bo'lishi kerak.", 'В разделе «Добавить» укажите фото, название, цену и количество. Ваш аккаунт должен быть подтверждён администратором.', '«Ekle» bölümünde görsel, ad, fiyat ve adedi girin. Hesabınızın yönetici tarafından onaylanmış olması gerekir.'],
    ['Hafta chegirmasi nima?', 'Что такое скидка недели?', 'Haftanın indirimi nedir?'],
    ["Mahsulot tahrirlashda «Hafta chegirmasi»ni yoqib, chegirma narxini kiriting. U 7 kun ko'rinadi, keyin narx o'zi asl holiga qaytadi.", 'При редактировании товара включите «Скидку недели» и укажите цену со скидкой. Она действует 7 дней, затем цена сама вернётся к прежней.', 'Ürünü düzenlerken «Haftanın indirimi»ni açıp indirimli fiyatı girin. 7 gün geçerlidir, sonra fiyat kendiliğinden eski haline döner.'],
    ['Komissiya qancha?', 'Сколько комиссия?', 'Komisyon ne kadar?'],
    ["Har bir yetkazilgan buyurtmadan 1% komissiya olinadi. «To'lov» bo'limida jami komissiya va qarzingiz ko'rinadi.", 'С каждого доставленного заказа берётся комиссия 1%. В разделе «Оплата» видны общая комиссия и ваш долг.', 'Teslim edilen her siparişten %1 komisyon alınır. «Ödeme» bölümünde toplam komisyon ve borcunuz görünür.'],
    ['Qarz limiti nima?', 'Что такое лимит долга?', 'Borç limiti nedir?'],
    ["Qarzingiz 10 000 so'mdan oshsa, mahsulotlaringiz xaridorlarga ko'rinmay qoladi. To'lov qilib chek yuborsangiz, admin tasdiqlagach qayta ochiladi.", 'Если долг превысит 10 000 сум, ваши товары перестанут показываться покупателям. После оплаты и отправки чека товары снова откроются, как только администратор подтвердит.', 'Borcunuz 10 000 som\'u aşarsa ürünleriniz alıcılara görünmez olur. Ödeme yapıp dekont gönderirseniz yönetici onayladığında yeniden açılır.'],
    ["Karta orqali to'lovni qanday olaman?", 'Как получать оплату на карту?', 'Kartla ödemeyi nasıl alırım?'],
    ["Profil → Mening hisobim bo'limida karta raqamingizni saqlang. Xaridor shu kartaga o'tkazadi va chek yuboradi, siz «Tasdiqlash» tugmasini bosasiz.", 'Сохраните номер карты в разделе Профиль → Мой счёт. Покупатель переведёт деньги на карту и отправит чек, а вы нажмёте «Подтвердить».', 'Profil → Hesabım bölümünde kart numaranızı kaydedin. Alıcı bu karta gönderip dekont yollar, siz «Onayla» düğmesine basarsınız.'],
    ["Buyurtmani qachon yetkazildi deyman?", 'Когда отмечать заказ доставленным?', 'Siparişi ne zaman teslim edildi olarak işaretlerim?'],
    ["Siz buyurtmani kuryerga topshirasiz. «Yetkazildi» holatini xaridor «Mahsulotni oldim» tugmasi bilan o'zi tasdiqlaydi.", 'Вы передаёте заказ курьеру. Статус «Доставлен» покупатель подтверждает сам кнопкой «Я получил товар».', 'Siz siparişi kuryeye teslim edersiniz. «Teslim edildi» durumunu alıcı «Ürünü aldım» düğmesiyle kendisi onaylar.'],

    // ---- Sotuvchi: hisob ----
    ["Admin pul tushirsa, balansda shu yerda ko'rinadi", 'Когда админ зачислит деньги, баланс появится здесь', 'Yönetici para yatırdığında bakiye burada görünür'],
    ['Hisob raqami', 'Номер счёта', 'Hesap numarası'],
    ['Balans', 'Баланс', 'Bakiye'],
    ['(kiritilmagan)', '(не указана)', '(girilmedi)'],
    ['Karta kiritilmagan', 'Карта не указана', 'Kart girilmedi'],
    ['Karta raqami (16 xonali)', 'Номер карты (16 цифр)', 'Kart numarası (16 haneli)'],
    ['Ism familiya', 'Имя и фамилия', 'Ad soyad'],
    ['Karta egasi', 'Владелец карты', 'Kart sahibi'],
    ['Kartani saqlash', 'Сохранить карту', 'Kartı kaydet'],
    ['Karta saqlandi ✅', 'Карта сохранена ✅', 'Kart kaydedildi ✅'],
    ["Xaridorlar karta orqali to'laganda shu kartaga o'tkazadi (ism faqat bosh harflarda ko'rinadi).", 'Покупатели будут переводить деньги на эту карту (имя отображается только инициалами).', 'Alıcılar kartla öderken bu karta gönderir (ad yalnızca baş harflerle görünür).'],
    ["Karta raqami 16 ta raqam bo'lishi kerak", 'Номер карты должен состоять из 16 цифр', 'Kart numarası 16 haneli olmalıdır'],
    ['Ism familiyani kiriting', 'Введите имя и фамилию', 'Ad soyadı girin'],
    ['Ismingizni kiriting', 'Введите ваше имя', 'Adınızı girin'],

    // ---- Sotuvchi: mahsulotlar ----
    ['Mening mahsulotlarim', 'Мои товары', 'Ürünlerim'],
    ['Tahrirlash', 'Изменить', 'Düzenle'],
    ["O'chirish", 'Удалить', 'Sil'],
    ["Hali mahsulot qo'shmagansiz.", 'Вы ещё не добавили ни одного товара.', 'Henüz ürün eklemediniz.'],
    ['"Qo\'shish" bo\'limiga o\'ting.', 'Перейдите в раздел «Добавить».', '«Ekle» bölümüne gidin.'],
    ['Mahsulot rasmi', 'Фото товара', 'Ürün görseli'],
    ['Rasm tanlanmagan', 'Фото не выбрано', 'Görsel seçilmedi'],
    ['Nomi', 'Название', 'Ad'],
    ['Kategoriya', 'Категория', 'Kategori'],
    ["Narxi (so'm)", 'Цена (сум)', 'Fiyat (som)'],
    ["Eski narx (chegirma uchun, ixtiyoriy)", 'Старая цена (для скидки, необязательно)', 'Eski fiyat (indirim için, isteğe bağlı)'],
    ["🔥 Hafta chegirmasi (7 kundan keyin o'zi tugaydi)", '🔥 Скидка недели (сама закончится через 7 дней)', '🔥 Haftanın indirimi (7 gün sonra kendiliğinden biter)'],
    ["7 kundan keyin narx avtomatik asl narxga qaytadi.", 'Через 7 дней цена автоматически вернётся к обычной.', '7 gün sonra fiyat otomatik olarak normale döner.'],
    ["Chegirma narxi (so'm)", 'Цена со скидкой (сум)', 'İndirimli fiyat (som)'],
    ['Nechta bor (soni)', 'Сколько в наличии (шт.)', 'Kaç adet var'],
    ['Tavsif', 'Описание', 'Açıklama'],
    ['Mahsulot haqida qisqacha', 'Кратко о товаре', 'Ürün hakkında kısaca'],
    ['Masalan: Samsung Galaxy', 'Например: Samsung Galaxy', 'Örneğin: Samsung Galaxy'],
    ["🚚 Yetkazib berish narxi (so'm)", '🚚 Стоимость доставки (сум)', '🚚 Teslimat ücreti (som)'],
    ["Qaysi hududlarga yetkazib berasiz?", 'В какие регионы вы доставляете?', 'Hangi bölgelere teslimat yaparsınız?'],
    ['Barcha viloyatlar', 'Все области', 'Tüm vilayetler'],
    ['Bekor qilish', 'Отмена', 'İptal'],
    ['Saqlash', 'Сохранить', 'Kaydet'],
    ["Mahsulot qo'shish", 'Добавить товар', 'Ürün ekle'],
    ['Yangi mahsulot', 'Новый товар', 'Yeni ürün'],
    ['Mahsulotni tahrirlash', 'Редактирование товара', 'Ürünü düzenle'],
    ["Rostdan ham o'chirmoqchimisiz?", 'Вы действительно хотите удалить?', 'Gerçekten silmek istiyor musunuz?'],
    ["Mahsulot o'chirildi", 'Товар удалён', 'Ürün silindi'],
    ["Mahsulot qo'shildi! ✅", 'Товар добавлен! ✅', 'Ürün eklendi! ✅'],
    ['Mahsulot yangilandi! ✅', 'Товар обновлён! ✅', 'Ürün güncellendi! ✅'],
    ['Rasm tayyorlanmoqda...', 'Подготовка изображения...', 'Görsel hazırlanıyor...'],
    ['Nom va narxni kiriting', 'Введите название и цену', 'Ad ve fiyatı girin'],
    ['Nechta borligini kiriting', 'Укажите количество в наличии', 'Stok adedini girin'],
    ["Kamida bitta hududni tanlang yoki 'Barcha viloyatlar'ni belgilang", "Выберите хотя бы один регион или отметьте «Все области»", "En az bir bölge seçin veya 'Tüm vilayetler'i işaretleyin"],
    ["Chegirma narxi asl narxdan past bo'lishi kerak", 'Цена со скидкой должна быть ниже обычной', 'İndirimli fiyat normal fiyattan düşük olmalıdır'],
    ["Nom, kategoriya va narxni kiriting", 'Введите название, категорию и цену', 'Ad, kategori ve fiyatı girin'],
    ['Hisobingiz hali admin tomonidan tasdiqlanmagan', 'Ваш аккаунт ещё не подтверждён администратором', 'Hesabınız henüz yönetici tarafından onaylanmadı'],
    ['Hisobingiz rad etilgan yoki bloklangan', 'Ваш аккаунт отклонён или заблокирован', 'Hesabınız reddedildi veya engellendi'],
    ["Admin bilan bog'laning.", 'Свяжитесь с администратором.', 'Yönetici ile iletişime geçin.'],
    ["⏳ Arizangiz ko'rib chiqilmoqda", '⏳ Ваша заявка на рассмотрении', '⏳ Başvurunuz inceleniyor'],
    ["Arizangiz ko'rib chiqilmoqda", 'Ваша заявка на рассмотрении', 'Başvurunuz inceleniyor'],
    ["Admin pasport va selfingizni tekshirgach, mahsulot qo'sha olasiz.", 'После проверки администратором паспорта и селфи вы сможете добавлять товары.', 'Yönetici pasaportunuzu ve selfienizi kontrol ettikten sonra ürün ekleyebilirsiniz.'],
    ['Tekshirish', 'Проверить', 'Kontrol et'],

    // ---- Sotuvchi: buyurtmalar / daromad ----
    ["Hali buyurtma tushmagan", 'Заказов пока нет', 'Henüz sipariş gelmedi'],
    ['Kelgan buyurtmalar', 'Поступившие заказы', 'Gelen siparişler'],
    ['Sizga tushum', 'Ваш доход', 'Gelirleriniz'],
    ["«Yetkazildi» holatini xaridor «Oldim» tugmasi bilan qo'yadi", 'Статус «Доставлен» ставит покупатель кнопкой «Получил»', '«Teslim edildi» durumunu alıcı «Aldım» düğmesiyle koyar'],
    ['Jami savdo', 'Всего продаж', 'Toplam satış'],
    ["To'langan komissiya", 'Оплаченная комиссия', 'Ödenen komisyon'],
    ['Ruxsat etilgan limit', 'Допустимый лимит', 'İzin verilen limit'],
    ["⚠️ Qarzingiz limitdan oshgan! Mahsulotlaringiz ko'rinmayapti. To'lov qilib, admin tasdiqlashi bilan qayta ochiladi.", '⚠️ Ваш долг превысил лимит! Ваши товары скрыты. После оплаты и подтверждения администратором они снова откроются.', '⚠️ Borcunuz limiti aştı! Ürünleriniz görünmüyor. Ödeme yapıp yönetici onayladığında yeniden açılır.'],
    ["Komissiyani shu kartaga o'tkazing", 'Переведите комиссию на эту карту', 'Komisyonu bu karta gönderin'],
    ["Daromad ma'lumotlarini yuklab bo'lmadi", 'Не удалось загрузить данные о доходах', 'Gelir bilgileri yüklenemedi'],
    ['Komissiya va to\'lov', 'Комиссия и оплата', 'Komisyon ve ödeme'],
    ["To'lov yuborish", 'Отправить платёж', 'Ödeme gönder'],
    ["To'langan summa (so'm)", 'Оплаченная сумма (сум)', 'Ödenen tutar (som)'],
    ['Chek yoki skrinshot', 'Чек или скриншот', 'Dekont veya ekran görüntüsü'],
    ['Yuborish', 'Отправить', 'Gönder'],
    ["Mening to'lovlarim", 'Мои платежи', 'Ödemelerim'],
    ["To'lov yuborildi, admin tasdiqlaydi ✅", 'Платёж отправлен, администратор подтвердит ✅', 'Ödeme gönderildi, yönetici onaylayacak ✅'],
    ['Summani kiriting', 'Введите сумму', 'Tutarı girin'],
    ['Masalan: 50000', 'Например: 50000', 'Örneğin: 50000'],
    ["Qarzingiz yo'q", 'У вас нет долга', 'Borcunuz yok'],
    ['Qarzingiz', 'Ваш долг', 'Borcunuz'],
    ['Tasdiqlash', 'Подтвердить', 'Onayla'],
    ['Rad etish', 'Отклонить', 'Reddet'],
    ["Holat yangilandi", 'Статус обновлён', 'Durum güncellendi'],
    ['Chek yoki skrinshot rasmini yuklang', 'Загрузите фото чека или скриншот', 'Dekont veya ekran görüntüsü yükleyin'],
    ['Chek rasmini yuklang', 'Загрузите фото чека', 'Dekont görselini yükleyin'],
    ['Chek allaqachon yuborilgan', 'Чек уже отправлен', 'Dekont zaten gönderildi'],
    ["Sotuvchi hali mahsulotni topshirmagan", 'Продавец ещё не передал товар', 'Satıcı henüz ürünü teslim etmedi'],
    ["To'lov hali tasdiqlanmagan", 'Оплата ещё не подтверждена', 'Ödeme henüz onaylanmadı'],
    ["Avval xaridor to'lovini tasdiqlang", 'Сначала подтвердите оплату покупателя', 'Önce alıcının ödemesini onaylayın'],
    ["Faqat sotib olgan mahsulotingizga baho qo'ya olasiz", 'Оценить можно только купленный товар', 'Yalnızca satın aldığınız ürüne puan verebilirsiniz'],
    ["Bahoni 1 dan 5 gacha tanlang", 'Выберите оценку от 1 до 5', 'Puanı 1 ile 5 arasında seçin'],

    // ---- Reklama (sotuvchi/admin ekranlari) ----
    ['Yangi reklama', 'Новая реклама', 'Yeni reklam'],
    ["Rasm (tavsiya: 1200×400, istalgan o'lcham to'liq ko'rinadi)", 'Изображение (рекомендуется 1200×400, любой размер отображается полностью)', 'Görsel (önerilen: 1200×400, her boyut tam görünür)'],
    ["Sarlavha (faqat o'zingiz uchun)", 'Заголовок (только для вас)', 'Başlık (sadece sizin için)'],
    ["Bosilganda ochiladigan havola (ixtiyoriy)", 'Ссылка при нажатии (необязательно)', 'Tıklayınca açılacak bağlantı (isteğe bağlı)'],
    ["Necha kun turadi (bo'sh bo'lsa cheksiz)", 'На сколько дней (пусто = без ограничения)', 'Kaç gün kalacak (boşsa süresiz)'],
    ["Tartib raqami (kichigi birinchi chiqadi)", 'Порядковый номер (меньший показывается первым)', 'Sıra numarası (küçük olan önce çıkar)'],
    ["Reklamani qo'shish", 'Добавить рекламу', 'Reklamı ekle'],
    ["Ko'rishlar / bosishlar", 'Просмотры / нажатия', 'Görüntülenme / tıklama'],
    ['Tugash sanasi', 'Дата окончания', 'Bitiş tarihi'],
    ['Havola', 'Ссылка', 'Bağlantı'],
    ['Muddat', 'Срок', 'Süre'],
    ["🗑 Butunlay o'chirish", '🗑 Удалить навсегда', '🗑 Tamamen sil'],
    ["Hali reklama yo'q", 'Рекламы пока нет', 'Henüz reklam yok'],
    ["O'chiq", 'Выкл.', 'Kapalı'],
    ["O'chirib qo'yish", 'Отключить', 'Devre dışı bırak'],
    ['Yoqish', 'Включить', 'Aç'],
    ['Muddati tugagan', 'Срок истёк', 'Süresi doldu'],
    ['Sarlavhasiz', 'Без заголовка', 'Başlıksız'],
    ["Reklama qo'shildi ✅", 'Реклама добавлена ✅', 'Reklam eklendi ✅'],
    ['Reklama rasmini yuklang', 'Загрузите изображение рекламы', 'Reklam görselini yükleyin'],
    ["Reklama butunlay o'chiriladi. Davom etasizmi?", 'Реклама будет удалена навсегда. Продолжить?', 'Reklam tamamen silinecek. Devam edilsin mi?'],
    ["Reklama o'chirildi", 'Реклама удалена', 'Reklam silindi'],
    ["Muddat yangilandi ✅", 'Срок обновлён ✅', 'Süre güncellendi ✅'],

    // ---- Ob-havo / namoz ----
    ['Bomdod', 'Фаджр', 'Sabah'],
    ['Peshin', 'Зухр', 'Öğle'],
    ['Asr', 'Аср', 'İkindi'],
    ['Shom', 'Магриб', 'Akşam'],
    ['Xufton', 'Иша', 'Yatsı'],
    ['Ochiq', 'Ясно', 'Açık'],
    ['Bulutli', 'Облачно', 'Bulutlu'],
    ['Tuman', 'Туман', 'Sisli'],
    ["Yomg'ir", 'Дождь', 'Yağmur'],
    ['Jala', 'Ливень', 'Sağanak'],
    ['Qor', 'Снег', 'Kar'],
    ['Momaqaldiroq', 'Гроза', 'Gök gürültülü fırtına'],
    ['Hisobingiz faol', 'Ваш аккаунт активен', 'Hesabınız aktif'],
    ['Hali tasdiqlanmagan', 'Ещё не подтверждён', 'Henüz onaylanmadı'],
    ['Masalan: Faberlic aksiyasi', 'Например: акция Faberlic', 'Örneğin: Faberlic kampanyası'],
    ['{n}ta hudud', '{n} регион(ов)', '{n} bölge'],
    ['{n} ta mahsulot', '{n} товаров', '{n} ürün'],
    ['Omborda: {n} dona', 'В наличии: {n} шт.', 'Stokta: {n} adet'],
    ['⚡ Faqat {n} dona qoldi!', '⚡ Осталось всего {n} шт.!', '⚡ Sadece {n} adet kaldı!'],
    ['Omborda shuncha bor: {n} dona', 'Больше нет в наличии: {n} шт.', 'Stokta bu kadar var: {n} adet'],
    ['⏱ {n} KUN', '⏱ {n} ДН.', '⏱ {n} GÜN'],
    ['⏱ Chegirma tugashiga {n} kun', '⏱ До конца скидки {n} дн.', '⏱ İndirimin bitmesine {n} gün'],
    ['🔥 Hafta chegirmasi: {n} kun qoldi', '🔥 Скидка недели: осталось {n} дн.', '🔥 Haftanın indirimi: {n} gün kaldı'],
    ['Jami: {n} so\'m', 'Итого: {n} сум', 'Toplam: {n} som'],
    ['🏪 {n} ta sotuvchi tasdiqlashni kutmoqda', '🏪 Продавцов ждут подтверждения: {n}', '🏪 Onay bekleyen satıcı: {n}'],
    ['💳 {n} ta to\'lov tekshirishni kutmoqda', '💳 Платежей ждут проверки: {n}', '💳 Kontrol bekleyen ödeme: {n}'],
    ['🚚 Barcha viloyatlar', '🚚 Все области', '🚚 Tüm vilayetler'],
    ['{n} $ Olish', '{n} $ Покупка', '{n} $ Alış'],
    ['{n} $ Sotish', '{n} $ Продажа', '{n} $ Satış'],
    ["{n} so'm", '{n} сум', '{n} som'],
    ["{n} soat {n} daq", '{n} ч {n} мин', '{n} sa {n} dk'],
    ['{n} daq', '{n} мин', '{n} dk'],
    ['{n} kun qoldi', 'Осталось {n} дн.', '{n} gün kaldı'],
    ['{n} ta hudud', '{n} регион(ов)', '{n} bölge'],
    ['{n} ta sharh', '{n} отзывов', '{n} yorum'],
    ['{n} dona', '{n} шт.', '{n} adet'],
    ['Reklamalar ({n})', 'Реклама ({n})', 'Reklamlar ({n})'],
    ['Mahsulotlar ({n})', 'Товары ({n})', 'Ürünler ({n})'],
    ['Savat ({n})', 'Корзина ({n})', 'Sepet ({n})']
  ];

  // Dinamik qismli (nom, son) matnlar uchun andozalar
  var P = [
    [/^"(.+)" savatga qo'shildi$/, '«$1» добавлен в корзину', '«$1» sepete eklendi'],
    [/^⚠️ Quyidagilar "(.+)"ga yetkazilmaydi: (.+)$/, '⚠️ В «$1» не доставляются: $2', '⚠️ Şunlar «$1» bölgesine teslim edilmiyor: $2'],
    [/^"(.+)" "(.+)" hududiga yetkazilmaydi$/, '«$1» не доставляется в регион «$2»', '«$1» «$2» bölgesine teslim edilmiyor'],
    [/^"(.+)" hozir sotuvda emas$/, '«$1» сейчас не продаётся', '«$1» şu anda satışta değil'],
    [/^"(.+)" omborda yetarli emas \(bor: (\d+) dona\)$/, '«$1» нет в достаточном количестве (в наличии: $2 шт.)', '«$1» stokta yeterli değil (mevcut: $2 adet)'],
    [/^"(.+)" sotuvchisi karta kiritmagan\. Naqd to'lovni tanlang$/, 'Продавец «$1» не указал карту. Выберите оплату наличными', '«$1» satıcısı kart girmemiş. Nakit ödemeyi seçin'],
    [/^Balansda yetarli mablag' yo'q \(bor: (\d+) so'm\)$/, 'Недостаточно средств на балансе (есть: $1 сум)', 'Bakiyede yeterli tutar yok (mevcut: $1 som)'],
    [/^⚠️ Qarzingiz limitdan \((.+)\) oshgan! Mahsulotlaringiz xaridorlarga ko'rinmayapti\. "To'lov" bo'limidan to'lov yuboring\.$/, '⚠️ Ваш долг превысил лимит ($1)! Ваши товары не видны покупателям. Отправьте платёж в разделе «Оплата».', '⚠️ Borcunuz limiti ($1) aştı! Ürünleriniz alıcılara görünmüyor. «Ödeme» bölümünden ödeme gönderin.'],
    [/^Buyurtma #(\d+)$/, 'Заказ #$1', 'Sipariş #$1']
  ];

  var TR_MAP = {}, MAP = { ru: {}, tr: {} };
  function norm(s) { return String(s).replace(/[\u02bb\u02bc\u2018\u2019`\u00b4]/g, "'"); }
  D.forEach(function (r) { var k = norm(r[0]); MAP.ru[k] = r[1]; MAP.tr[k] = r[2]; });

  var NUM = /\d+(?:[\s\u00a0\u202f]\d{3})*(?:[.,]\d+)?/g;
  function lookup(s) {
    if (lang === 'uz') return null;
    var m = MAP[lang], k = norm(s), r;
    if (m[k] !== undefined) return m[k];
    // Raqamli andoza: "12 000 so'm" -> "{n} so'm"
    var nums = k.match(NUM);
    if (nums) {
      var key = k.replace(NUM, '{n}');
      if (m[key] !== undefined) { var i = 0; return m[key].replace(/\{n\}/g, function () { return nums[i++] || ''; }); }
    }
    // Regex andozalar
    for (var j = 0; j < P.length; j++) {
      var mm = k.match(P[j][0]);
      if (mm) return k.replace(P[j][0], P[j][lang === 'ru' ? 1 : 2]);
    }
    // Boshidagi belgi/emoji'ni ajratib tarjima qilish: "🚚 Barcha viloyatlar"
    var pm = k.match(/^([^A-Za-z\u00c0-\u024f\u0400-\u04ff{]+)([A-Za-z\u00c0-\u024f].*)$/);
    if (pm) { r = lookup(pm[2]); if (r !== null) return pm[1] + r; }
    // Vergul bilan ajratilgan ro'yxat (viloyat nomlari)
    if (k.indexOf(', ') > -1 && k.length < 200) {
      var cp = k.split(', '), cc = false;
      var co = cp.map(function (p) { var t = lookup(p); if (t !== null && t !== p) { cc = true; return t; } return p; });
      if (cc) return co.join(', ');
    }
    // " · " bilan ajratilgan qismlar
    if (k.indexOf(' \u00b7 ') > -1) {
      var parts = k.split(' \u00b7 '), ch = false;
      var out = parts.map(function (p) { var t = lookup(p); if (t !== null && t !== p) { ch = true; return t; } return p; });
      if (ch) return out.join(' \u00b7 ');
    }
    return null;
  }
  function tx(s) {
    if (lang === 'uz' || !s) return s;
    var lead = s.match(/^\s*/)[0], trail = s.match(/\s*$/)[0], core = s.trim();
    if (!core || !/[A-Za-z]/.test(core)) return s;
    var r = lookup(core);
    return r === null ? s : lead + r + trail;
  }
  window.SU_T = tx;

  // ---- DOM tarjimasi (asl matn saqlanadi, til o'zgarganda qaytadan hisoblanadi) ----
  var ATTRS = ['placeholder', 'title', 'aria-label', 'alt'];
  function doText(n) {
    var p = n.parentNode; if (!p) return;
    var tag = p.nodeName;
    if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'TEXTAREA' || (p.closest && p.closest('[data-nt]'))) return;
    if (n.__o === undefined) n.__o = n.nodeValue;
    // Qiymatsiz <option> — qiymati matnning o'zi bo'lgani uchun asl qiymatni qotirib qo'yamiz
    if (tag === 'OPTION' && !p.hasAttribute('value')) p.setAttribute('value', n.__o);
    var cur = n.nodeValue, want;
    // Matn dastur tomonidan yangilangan bo'lsa (asl emas va tarjima ham emas), yangi qiymatni asl qilamiz
    if (n.__t !== undefined && cur !== n.__t) n.__o = cur;
    want = tx(n.__o);
    if (want !== cur) n.nodeValue = want;
    n.__t = want;
  }
  function doEl(el) {
    if (el.nodeType !== 1) return;
    for (var i = 0; i < ATTRS.length; i++) {
      var a = ATTRS[i];
      if (el.hasAttribute && el.hasAttribute(a)) {
        var o = el['__o_' + a], v = el.getAttribute(a);
        if (o === undefined || (el['__t_' + a] !== undefined && v !== el['__t_' + a])) { o = v; el['__o_' + a] = v; }
        var w = tx(o); if (w !== v) el.setAttribute(a, w);
        el['__t_' + a] = w;
      }
    }
  }
  var busy = false;
  function walk(root) {
    if (!root) return;
    if (root.nodeType === 3) { doText(root); return; }
    if (root.nodeType !== 1 && root.nodeType !== 9) return;
    if (root.nodeType === 1) doEl(root);
    var tw = document.createTreeWalker(root, 1 | 4, null), n;
    while ((n = tw.nextNode())) { if (n.nodeType === 3) doText(n); else doEl(n); }
  }
  var mo;
  function run(fn) { busy = true; try { fn(); } catch (e) {} busy = false; }
  function start() {
    if (!document.body) return;
    mo = new MutationObserver(function (list) {
      if (busy) return;
      run(function () {
        for (var i = 0; i < list.length; i++) {
          var m = list[i];
          if (m.type === 'childList') m.addedNodes.forEach(walk);
          else if (m.type === 'characterData') doText(m.target);
          else if (m.type === 'attributes') doEl(m.target);
        }
      });
    });
    mo.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
    run(function () { walk(document.body); });
    document.documentElement.lang = lang;
  }

  // ---- confirm / alert / prompt ----
  var _c = window.confirm, _a = window.alert, _p = window.prompt;
  window.confirm = function (m) { return _c.call(window, tx(m)); };
  window.alert = function (m) { return _a.call(window, tx(m)); };
  window.prompt = function (m, d) { return _p.call(window, tx(m), d); };

  // ---- Til almashtirish ----
  function setLang(l) {
    if (!LANGS[l]) return;
    lang = l;
    try { localStorage.setItem('savdouz_lang', l); } catch (e) {}
    document.documentElement.lang = l;
    run(function () { walk(document.body); });
    var f = document.getElementById('su-langfab'); if (f) f.textContent = '\ud83c\udf10 ' + l.toUpperCase();
  }
  window.getLang = function () { return lang; };
  window.setLang = setLang;

  function openPicker() {
    var old = document.getElementById('su-langpick'); if (old) old.remove();
    var ov = document.createElement('div');
    ov.id = 'su-langpick'; ov.setAttribute('data-nt', '1');
    ov.style.cssText = 'position:fixed;left:0;right:0;top:0;bottom:0;background:rgba(21,15,46,.55);z-index:100;display:flex;align-items:flex-end;justify-content:center;';
    var box = document.createElement('div');
    box.style.cssText = 'background:var(--card,#fff);color:var(--ink,#150F2E);width:100%;max-width:480px;border-radius:22px 22px 0 0;padding:18px 18px 26px;font-family:-apple-system,Segoe UI,sans-serif;';
    var h = document.createElement('div');
    h.style.cssText = 'font-size:16px;font-weight:800;margin-bottom:12px;';
    h.textContent = '\ud83c\udf10 Til / \u042f\u0437\u044b\u043a / Dil';
    box.appendChild(h);
    Object.keys(LANGS).forEach(function (k) {
      var b = document.createElement('button');
      b.textContent = (k === lang ? '\u2713  ' : '') + LANGS[k];
      b.style.cssText = 'display:block;width:100%;text-align:left;border:1.5px solid ' + (k === lang ? '#6C4BF4' : '#ECE9F5') + ';background:' + (k === lang ? '#F1EDFE' : 'transparent') + ';color:inherit;border-radius:14px;padding:14px;font-size:15px;font-weight:700;margin-bottom:8px;';
      b.onclick = function () { setLang(k); ov.remove(); };
      box.appendChild(b);
    });
    ov.appendChild(box);
    ov.onclick = function (e) { if (e.target === ov) ov.remove(); };
    document.body.appendChild(ov);
  }
  window.openLangPicker = openPicker;

  // Kirish ekranida (tizimga kirmasdan oldin) til tugmasi
  function fab() {
    var b = document.createElement('button');
    b.id = 'su-langfab'; b.setAttribute('data-nt', '1');
    b.textContent = '\ud83c\udf10 ' + lang.toUpperCase();
    b.style.cssText = 'position:fixed;top:calc(12px + env(safe-area-inset-top,0px));right:12px;z-index:40;border:none;border-radius:999px;padding:8px 14px;background:#F1EDFE;color:#4E2FD9;font-weight:800;font-size:13px;display:none;';
    b.onclick = openPicker;
    document.body.appendChild(b);
    setInterval(function () { b.style.display = document.querySelector('.authwrap') ? 'block' : 'none'; }, 400);
  }

  function init() { start(); fab(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
