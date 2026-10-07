-- phpMyAdmin SQL Dump
-- version 5.2.1
-- https://www.phpmyadmin.net/
--
-- Host: 127.0.0.1
-- Generation Time: Oct 07, 2026 at 05:56 AM
-- Server version: 10.4.32-MariaDB
-- PHP Version: 8.2.12

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- Database: `cert_requests`
--

-- --------------------------------------------------------

--
-- Table structure for table `certificate_types`
--

CREATE TABLE `certificate_types` (
  `id` int(11) NOT NULL,
  `name` varchar(120) NOT NULL,
  `fee` decimal(10,2) NOT NULL,
  `active` tinyint(1) DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `certificate_types`
--

INSERT INTO `certificate_types` (`id`, `name`, `fee`, `active`) VALUES
(1, 'Certificate of Enrollment', 20.00, 1),
(2, 'Certificate of Good Moral Character', 20.00, 1),
(3, 'Certificate of Grades', 20.00, 1),
(4, 'Certificate of Graduation', 20.00, 1);

-- --------------------------------------------------------

--
-- Table structure for table `requests`
--

CREATE TABLE `requests` (
  `id` int(11) NOT NULL,
  `reference_no` varchar(30) NOT NULL,
  `student_id` varchar(30) NOT NULL,
  `student_name` varchar(150) NOT NULL,
  `email` varchar(150) NOT NULL,
  `contact` varchar(30) DEFAULT NULL,
  `certificate_type_id` int(11) NOT NULL,
  `purpose` varchar(255) NOT NULL,
  `copies` int(11) NOT NULL DEFAULT 1,
  `amount` decimal(10,2) NOT NULL,
  `status` enum('pending_payment','paid','processing','ready','released','cancelled') DEFAULT 'pending_payment',
  `checkout_session_id` varchar(80) DEFAULT NULL,
  `paid_at` datetime DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `requests`
--

INSERT INTO `requests` (`id`, `reference_no`, `student_id`, `student_name`, `email`, `contact`, `certificate_type_id`, `purpose`, `copies`, `amount`, `status`, `checkout_session_id`, `paid_at`, `created_at`) VALUES
(1, 'CERT-2026-9DFD46', '24-5250-01', 'Carl Martin Angeles', 'angelescarlmartin@gmail.com', '09217237439', 1, 'for scholarship', 1, 20.00, 'paid', 'cs_95ae4bf6ab49403de8e391fd', '2026-10-03 19:33:25', '2026-10-03 11:33:01'),
(2, 'CERT-2026-5592F0', '24-5250-02', 'Carl Martin Angeles', 'c24-5250-01@gmail.com', '09217237439', 2, 'for transfering', 1, 20.00, 'paid', 'cs_35f108fd5382cad05d6a74df', '2026-10-03 19:37:58', '2026-10-03 11:37:46'),
(3, 'CERT-2026-AF3E81', '1', 'cma', 'cma@gmail.com', '12345567889', 1, 'hjv', 1, 20.00, 'paid', 'cs_4cb4a1f629dcf718857067ad', '2026-10-03 20:08:48', '2026-10-03 12:08:28');

--
-- Indexes for dumped tables
--

--
-- Indexes for table `certificate_types`
--
ALTER TABLE `certificate_types`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `requests`
--
ALTER TABLE `requests`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `reference_no` (`reference_no`),
  ADD KEY `certificate_type_id` (`certificate_type_id`);

--
-- AUTO_INCREMENT for dumped tables
--

--
-- AUTO_INCREMENT for table `certificate_types`
--
ALTER TABLE `certificate_types`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=5;

--
-- AUTO_INCREMENT for table `requests`
--
ALTER TABLE `requests`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=4;

--
-- Constraints for dumped tables
--

--
-- Constraints for table `requests`
--
ALTER TABLE `requests`
  ADD CONSTRAINT `requests_ibfk_1` FOREIGN KEY (`certificate_type_id`) REFERENCES `certificate_types` (`id`);
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
