require('dotenv').config();
const mysql = require('mysql2/promise');

async function seed() {
  let connection;
  try {
    connection = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'gsp_ybm',
    });

    console.log('Connected to database:', process.env.DB_NAME);

    // Dummy Pemasukan (Income)
    const incomeData = [
      ['2025-04-01', 'Donatur Hamba Allah', 'Donasi', 5000000.00, 'Donasi kesehatan pasien rujukan', 'INV-IN-001', 'Bapak Budi'],
      ['2025-04-05', 'Zakat Yayasan ABC', 'Zakat', 12000000.00, 'Zakat bulanan untuk kegiatan operasional dan pembinaan', 'INV-IN-002', 'Bapak Andi'],
      ['2025-04-10', 'Infaq Jamaah Masjid', 'Infaq', 2500000.00, 'Infaq khusus kegiatan taklim & tahsin', 'INV-IN-003', 'Ust. Fulan'],
      ['2025-04-12', 'Bantuan YBM PLN', 'Dana YBM', 15000000.00, 'Dana rutin YBM untuk kesehatan dan harian', 'INV-IN-004', 'Bapak Wahyu']
    ];

    for (const data of incomeData) {
      await connection.query(
        `INSERT INTO FinanceIncome (income_date, source, category, amount, description, receipt_number, person_in_charge) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        data
      );
    }
    console.log('✅ Berhasil insert data dummy pemasukan');

    // Dummy Pengeluaran (Expenses)
    const expenseData = [
      ['2025-04-02', 'Kesehatan', 'Pembelian obat-obatan apotek dan P3K', 800000.00, 'Tunai', 'REC-001', 'Bapak Wahyu'],
      ['2025-04-04', 'Kesehatan', 'Pembayaran rumah sakit untuk rujuk Pasien A', 3500000.00, 'Transfer', 'REC-002', 'Bapak Wahyu'],
      ['2025-04-06', 'Operasional', 'Kegiatan Pembinaan: Insentif pengajar Tahsin', 1500000.00, 'Transfer', 'REC-003', 'Ust. Fulan'],
      ['2025-04-08', 'Konsumsi', 'Konsumsi peserta kegiatan Taklim dan Pembinaan', 600000.00, 'Tunai', 'REC-004', 'Bapak Andi'],
      ['2025-04-11', 'Operasional', 'Pembelian Al-Quran dan ATK untuk pembinaan', 450000.00, 'Tunai', 'REC-005', 'Bapak Andi'],
      ['2025-04-15', 'Kesehatan', 'Biaya periksa dokter spesialis Pasien B', 1200000.00, 'Transfer', 'REC-006', 'Bapak Wahyu'],
      ['2025-04-18', 'Transportasi', 'Transportasi Ambulans ke RS Pusat', 300000.00, 'Tunai', 'REC-007', 'Supir Ambulans']
    ];

    for (const data of expenseData) {
      await connection.query(
        `INSERT INTO FinanceExpenses (expense_date, category, description, amount, payment_method, receipt_number, person_in_charge) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        data
      );
    }
    console.log('✅ Berhasil insert data dummy pengeluaran');

  } catch (error) {
    console.error('❌ Error saat seed data:', error);
  } finally {
    if (connection) {
      await connection.end();
      console.log('Koneksi MySQL ditutup.');
    }
  }
}

seed();
